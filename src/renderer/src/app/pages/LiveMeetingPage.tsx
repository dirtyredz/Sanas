import { useEffect, useRef, useState } from 'react'
import type { Job, MeetingSource } from '@shared/types'
import { startCapture, type CaptureSession } from '../../audio/mic'
import { useTranscript } from '../../lib/useTranscript'
import { speakerDisplay } from '../../lib/speaker-label'
import { formatClock } from '../../lib/format-time'
import { errorText } from '../../lib/ipc-error'
import { IconLaptop, IconPeople } from '../../lib/icons'

const SOURCES: {
  value: MeetingSource
  label: string
  hint: string
  icon: () => React.JSX.Element
}[] = [
  {
    value: 'this-pc',
    label: 'This PC',
    hint: 'The call plays through this PC. Sanas taps that signal, so the mic is only you.',
    icon: IconLaptop,
  },
  {
    value: 'elsewhere',
    label: 'Elsewhere',
    hint: 'Another laptop or in the room. Everyone comes through the mic — mark your own voice once it is heard.',
    icon: IconPeople,
  },
]

export function LiveMeetingPage(): React.JSX.Element {
  const { lines, state } = useTranscript()
  const micRef = useRef<CaptureSession | null>(null)
  const [source, setSource] = useState<MeetingSource>('elsewhere')
  const [sysAudio, setSysAudio] = useState(false)
  const [busy, setBusy] = useState(false)
  const [micError, setMicError] = useState('')
  const [notice, setNotice] = useState('')
  const [userSpeakers, setUserSpeakers] = useState<Set<number>>(new Set())
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobId, setJobId] = useState<number | ''>('')
  const [elapsedMs, setElapsedMs] = useState(0)
  // elapsed counts listening time only: a pause folds the run so far into `banked`
  const banked = useRef(0)
  const runningSince = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const live = state.status === 'live'
  const paused = state.status === 'paused'
  const active = live || paused

  useEffect(() => {
    window.sanas.jobs.list().then((all) => {
      setJobs(all)
      // remember last-used job across sessions
      const last = Number(localStorage.getItem('sanas.lastJobId'))
      if (all.some((j) => j.id === last)) setJobId(last)
    })
    window.sanas.settings.get().then((s) => setSource(s.meetingSource))
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  // the clock runs only while live; pausing banks the run and stops it
  useEffect(() => {
    if (!live) return
    runningSince.current = Date.now()
    const t = setInterval(
      () => setElapsedMs(banked.current + (Date.now() - runningSince.current)),
      1000,
    )
    return () => {
      banked.current += Date.now() - runningSince.current
      setElapsedMs(banked.current)
      clearInterval(t)
    }
  }, [live])

  // the mic stops whenever we are not live — including a pause forced by main after a
  // lost connection, which the Pause button never ran
  useEffect(() => {
    if (!live && micRef.current) {
      micRef.current.stop()
      micRef.current = null
    }
  }, [live])
  useEffect(() => () => void micRef.current?.stop(), [])

  /** Opens the mic (and loopback in This PC mode) for the chosen source. */
  const capture = async (): Promise<CaptureSession> => {
    const settings = await window.sanas.settings.set({ meetingSource: source })
    return startCapture(settings.audioDeviceId, source === 'this-pc')
  }

  const start = async (): Promise<void> => {
    setBusy(true)
    setMicError('')
    setNotice('')
    banked.current = 0
    setElapsedMs(0)
    // held here, not in micRef, until main confirms the meeting: whatever is still in
    // this variable at the end was never adopted and has to be released, or the mic stays
    // open with nothing holding a reference to it
    let mic: CaptureSession | null = null
    try {
      if (jobId !== '') localStorage.setItem('sanas.lastJobId', String(jobId))
      // capture first — the meeting needs to know mono vs stereo (loopback)
      mic = await capture()
      const st = await window.sanas.meeting.start(jobId === '' ? undefined : jobId, mic.channels)
      if (st.status === 'live') {
        micRef.current = mic
        setSysAudio(mic.channels === 2)
        setUserSpeakers(new Set())
        if (source === 'this-pc' && mic.channels === 1) {
          setNotice(
            'System audio is unavailable, so this is mic-only: every voice is diarized. Mark your own voice below.',
          )
        }
        mic = null // adopted
      }
    } catch (e) {
      setMicError(errorText(e))
      await window.sanas.meeting.stop()
    } finally {
      await mic?.stop()
      setBusy(false)
    }
  }

  const pause = async (): Promise<void> => {
    setBusy(true)
    try {
      await micRef.current?.stop()
      micRef.current = null
      await window.sanas.meeting.pause()
    } finally {
      setBusy(false)
    }
  }

  const resume = async (): Promise<void> => {
    setBusy(true)
    setMicError('')
    let mic: CaptureSession | null = null // released below unless main adopts it
    try {
      await micRef.current?.stop() // never leave one behind
      micRef.current = null
      mic = await capture()
      // main refuses a topology this meeting did not start with (loopback can fail
      // independently on any attempt), so tell it what we actually got
      const st = await window.sanas.meeting.resume(mic.channels)
      if (st.status === 'live') {
        micRef.current = mic
        mic = null // adopted
        setSysAudio(micRef.current.channels === 2)
      }
      // still paused — the reason is in state.error, and the finally releases the mic
    } catch (e) {
      setMicError(errorText(e))
    } finally {
      await mic?.stop()
      setBusy(false)
    }
  }

  const stop = async (): Promise<void> => {
    setBusy(true)
    await micRef.current?.stop()
    micRef.current = null
    await window.sanas.meeting.stop()
    setBusy(false)
  }

  const togglePin = (speaker: number): void => {
    const isUser = !userSpeakers.has(speaker)
    window.sanas.meeting.pinSpeaker(speaker, isUser)
    setUserSpeakers((prev) => {
      const next = new Set(prev)
      if (isUser) next.add(speaker)
      else next.delete(speaker)
      return next
    })
  }

  // mono only: in stereo the channel decides who is the user, nothing to pin
  const speakers = sysAudio ? [] : [...new Set(lines.map((l) => l.speaker).filter((s) => s >= 0))]
  const sourceHint = SOURCES.find((s) => s.value === source)?.hint ?? ''

  return (
    <div className="live-page">
      <div className="live-toolbar">
        <h2>Live</h2>
        <select
          value={jobId}
          disabled={active}
          aria-label="Job"
          onChange={(e) => setJobId(e.target.value === '' ? '' : Number(e.target.value))}
        >
          <option value="">Unsorted</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </select>
        <div className="segmented" role="radiogroup" aria-label="Where is the meeting?">
          {SOURCES.map(({ value, label, hint, icon: Icon }) => (
            <button
              key={value}
              role="radio"
              aria-checked={source === value}
              className={source === value ? 'active' : ''}
              disabled={active}
              title={hint}
              onClick={() => setSource(value)}
            >
              <Icon />
              {label}
            </button>
          ))}
        </div>
        {!active && (
          <button className="btn btn-primary" onClick={start} disabled={busy}>
            ● Start listening
          </button>
        )}
        {live && (
          <button className="btn btn-pause" onClick={pause} disabled={busy}>
            ❙❙ Pause
          </button>
        )}
        {paused && (
          <button className="btn btn-primary" onClick={resume} disabled={busy}>
            ▶ Resume
          </button>
        )}
        {active && (
          <button className="btn btn-stop" onClick={stop} disabled={busy}>
            ■ Stop
          </button>
        )}
        {active && (
          <span className="listening">
            <span className={`dot ${live ? 'live' : 'paused'}`} />
            {live ? (sysAudio ? 'mic + system audio' : 'mic only') : 'paused — nothing captured'}
            <span className="elapsed">{formatClock(elapsedMs)}</span>
          </span>
        )}
      </div>
      {!active && <p className="muted source-hint">{sourceHint}</p>}

      {micError && <p className="notice warn">{micError}</p>}
      {state.error && <p className="notice warn">{state.error}</p>}
      {notice && <p className="notice warn">{notice}</p>}

      {active && !sysAudio && (
        <div className="speaker-bar">
          <span className="muted">Which voice is you?</span>
          {speakers.length === 0 && <span className="muted">— nothing heard yet</span>}
          {speakers.map((s) => (
            <button
              key={s}
              className={`chip ${userSpeakers.has(s) ? 'me' : ''}`}
              onClick={() => togglePin(s)}
              title="Click to mark this voice as you"
            >
              {userSpeakers.has(s) ? 'Me' : `Speaker ${s + 1}`}
            </button>
          ))}
        </div>
      )}

      <div className="transcript" ref={scrollRef}>
        {lines.length === 0 && (
          <p className="empty">
            {live
              ? 'Listening — say something…'
              : paused
                ? 'Paused. Resume when you are ready.'
                : 'Start listening to see the live transcript.'}
          </p>
        )}
        {lines.map((l, i) => {
          const isUser = l.isUser || userSpeakers.has(l.speaker)
          return (
            <p key={i} className={`line ${l.interim ? 'interim' : ''}`}>
              <span className="ts">{formatClock(l.tStartMs)}</span>
              <span className={`who ${isUser ? 'me' : ''}`}>
                {l.speaker >= 0 || isUser ? speakerDisplay(l.speaker, isUser) : ''}
              </span>
              <span className="text">{l.text}</span>
            </p>
          )
        })}
      </div>
    </div>
  )
}
