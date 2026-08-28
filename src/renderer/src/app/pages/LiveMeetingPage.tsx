import { useEffect, useRef, useState } from 'react'
import type { Job } from '@shared/types'
import { startCapture, type CaptureSession } from '../../audio/mic'
import { useTranscript } from '../../lib/useTranscript'

export function LiveMeetingPage(): React.JSX.Element {
  const { lines, state } = useTranscript()
  const micRef = useRef<CaptureSession | null>(null)
  const [sysAudio, setSysAudio] = useState(false)
  const [busy, setBusy] = useState(false)
  const [micError, setMicError] = useState('')
  const [userSpeakers, setUserSpeakers] = useState<Set<number>>(new Set())
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobId, setJobId] = useState<number | ''>('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const live = state.status === 'live'

  useEffect(() => {
    window.sanas.jobs.list().then((all) => {
      setJobs(all)
      // remember last-used job across sessions
      const last = Number(localStorage.getItem('sanas.lastJobId'))
      if (all.some((j) => j.id === last)) setJobId(last)
    })
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

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
    try {
      const settings = await window.sanas.settings.get()
      if (jobId !== '') localStorage.setItem('sanas.lastJobId', String(jobId))
      // capture first — the meeting needs to know mono vs stereo (loopback)
      const capture = await startCapture(settings.audioDeviceId, settings.captureSystemAudio)
      const st = await window.sanas.meeting.start(
        jobId === '' ? undefined : jobId,
        capture.channels
      )
      if (st.status === 'live') {
        micRef.current = capture
        setSysAudio(capture.channels === 2)
        setUserSpeakers(new Set())
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

  const speakers = [...new Set(lines.map((l) => l.speaker).filter((s) => s >= 0))]

  return (
    <div className="live">
      <div className="live-toolbar">
        <h2>Live</h2>
        <select
          value={jobId}
          disabled={live}
          onChange={(e) => setJobId(e.target.value === '' ? '' : Number(e.target.value))}
        >
          <option value="">Unsorted</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </select>
        {!live ? (
          <button className="rec" onClick={start} disabled={busy}>
            ● Start listening
          </button>
        ) : (
          <button className="rec stop" onClick={stop} disabled={busy}>
            ■ Stop
          </button>
        )}
        {live && (
          <span className="ok pulse">
            listening{sysAudio ? ' (mic + system audio)' : ' (mic only)'}…
          </span>
        )}
      </div>

      {(state.error || micError) && <p className="warn">{state.error || micError}</p>}

      {speakers.length > 0 && (
        <div className="speaker-bar">
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
          <p className="muted">
            {live ? 'Listening — say something…' : 'Start listening to see the live transcript.'}
          </p>
        )}
        {lines.map((l, i) => (
          <p key={i} className={`line ${l.interim ? 'interim' : ''}`}>
            {l.speaker >= 0 && (
              <span className={`who ${userSpeakers.has(l.speaker) ? 'me' : ''}`}>
                {userSpeakers.has(l.speaker) ? 'Me' : `S${l.speaker + 1}`}
              </span>
            )}
            {l.text}
          </p>
        ))}
      </div>
    </div>
  )
}
