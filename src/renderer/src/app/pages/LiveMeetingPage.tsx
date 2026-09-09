import { useEffect, useRef, useState } from 'react'
import type { Job, MeetingSource } from '@shared/types'
import { startCapture, type CaptureSession } from '../../audio/mic'
import { useTranscript } from '../../lib/useTranscript'
import { speakerDisplay } from '../../lib/speaker-label'
import { formatClock } from '../../lib/format-time'
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
  const startedAt = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const live = state.status === 'live'

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

  // elapsed clock while live
  useEffect(() => {
    if (!live) return
    startedAt.current = Date.now()
    setElapsedMs(0)
    const t = setInterval(() => setElapsedMs(Date.now() - startedAt.current), 1000)
    return () => clearInterval(t)
  }, [live])

  // stop mic if meeting dies (error) or on unmount
  useEffect(() => {
    if (!live && micRef.current) {
      micRef.current.stop()
      micRef.current = null
    }
  }, [live])
  useEffect(() => () => void micRef.current?.stop(), [])

  const start = async (): Promise<void> => {
    setBusy(true)
    setMicError('')
    setNotice('')
    try {
      if (jobId !== '') localStorage.setItem('sanas.lastJobId', String(jobId))
      // remember the source for next time; the reply carries the mic device too
      const settings = await window.sanas.settings.set({ meetingSource: source })
      // capture first — the meeting needs to know mono vs stereo (loopback)
      const capture = await startCapture(settings.audioDeviceId, source === 'this-pc')
      const st = await window.sanas.meeting.start(
        jobId === '' ? undefined : jobId,
        capture.channels,
      )
      if (st.status === 'live') {
        micRef.current = capture
        setSysAudio(capture.channels === 2)
        setUserSpeakers(new Set())
        if (source === 'this-pc' && capture.channels === 1) {
          setNotice(
            'System audio is unavailable, so this is mic-only: every voice is diarized. Mark your own voice below.',
          )
        }
      } else {
        await capture.stop()
      }
    } catch (e) {
      setMicError(e instanceof Error ? e.message : String(e))
      await window.sanas.meeting.stop()
    } finally {
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
          disabled={live}
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
              disabled={live}
              title={hint}
              onClick={() => setSource(value)}
            >
              <Icon />
              {label}
            </button>
          ))}
        </div>
        {!live ? (
          <button className="btn btn-primary" onClick={start} disabled={busy}>
            ● Start listening
          </button>
        ) : (
          <button className="btn btn-stop" onClick={stop} disabled={busy}>
            ■ Stop
          </button>
        )}
        {live && (
          <span className="listening">
            <span className="dot live" />
            {sysAudio ? 'mic + system audio' : 'mic only'}
            <span className="elapsed">{formatClock(elapsedMs)}</span>
          </span>
        )}
      </div>
      {!live && <p className="muted source-hint">{sourceHint}</p>}

      {(state.error || micError) && <p className="notice warn">{state.error || micError}</p>}
      {notice && <p className="notice warn">{notice}</p>}

      {live && !sysAudio && (
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
            {live ? 'Listening — say something…' : 'Start listening to see the live transcript.'}
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
