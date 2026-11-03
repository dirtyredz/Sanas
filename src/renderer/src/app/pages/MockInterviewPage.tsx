import { useEffect, useRef, useState } from 'react'
import { RESUME_MAX_CHARS, type MeetingResume } from '@shared/meeting-resume'
import { MeetingResumeInput } from '../../lib/meeting/resume/MeetingResumeInput'
import type { Job } from '@shared/types'
import type {
  MockPlanId,
  MockResult,
  MockSetup,
  MockState,
  PracticeSession,
} from '@shared/mock-interview/types'
import type { CaptureSession } from '../../audio/mic'
import { startCapturedMeeting } from '../../lib/meeting/start-captured-meeting'
import { useMeetingState } from '../../lib/meeting/useMeetingState'
import { errorText } from '../../lib/ipc-error'
import { MeetingView } from './MeetingView'

export function MockResults({ result }: { result: MockResult }): React.JSX.Element {
  const latency = (ms: number | null): string => (ms === null ? '—' : `${(ms / 1000).toFixed(2)} s`)
  return (
    <section className="card">
      <h3>{result.plan} · Practice results</h3>
      <p>
        Session: {result.reason}. Latency is measured from the last received loopback final to the
        main-window broadcast, not screen paint.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Interviewer question</th>
              <th>Automatic suggestion</th>
              <th>First visible</th>
              <th>Complete</th>
              <th>Words</th>
              <th>Outcome evidence</th>
            </tr>
          </thead>
          <tbody>
            {result.questions.map((q) => (
              <tr key={q.id}>
                <td>
                  {q.text}
                  {q.followUp && ' (follow-up)'}
                  {q.fallback && ' (planned fallback)'}
                </td>
                <td>{q.producedSuggestion ? 'Yes' : 'No'}</td>
                <td>{latency(q.firstVisibleLatencyMs)}</td>
                <td>{latency(q.completionLatencyMs)}</td>
                <td>{q.words}</td>
                <td>{q.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!result.questions.length && <p>No questions were spoken.</p>}
      <p>
        Manual Screen and Answer now responses remain in the meeting’s Suggestions. This table
        correlates automatic answers to recognized questions.
      </p>
    </section>
  )
}

export function MockInterviewPage({
  visible,
  onSettings,
}: {
  visible: boolean
  onSettings(): void
}): React.JSX.Element {
  const meeting = useMeetingState()
  const [setup, setSetup] = useState<MockSetup | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobId, setJobId] = useState<number | ''>('')
  const [plan, setPlan] = useState<MockPlanId>('interview')
  const [state, setState] = useState<MockState | null>(null)
  const [past, setPast] = useState<PracticeSession[]>([])
  const [selected, setSelected] = useState<PracticeSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resume, setResume] = useState<MeetingResume | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const invalidResume = !!resume && (!resume.text.trim() || resume.text.length > RESUME_MAX_CHARS)
  const importResume = async (): Promise<void> => {
    setImporting(true)
    setImportError('')
    try {
      const attachment = await window.sanas.meeting.importResume()
      if (attachment) setResume(attachment)
    } catch (e) {
      setImportError(errorText(e))
    } finally {
      setImporting(false)
    }
  }
  const mic = useRef<CaptureSession | null>(null)
  const mounted = useRef(true)
  const active = !!state && !['idle', 'ended'].includes(state.status)
  const refresh = (): void => {
    window.sanas.mockInterview
      .history()
      .then(setPast)
      .catch((e) => setError(errorText(e)))
  }
  useEffect(() => {
    mounted.current = true
    const receive = (s: MockState): void => {
      setState(s)
      if (s.status === 'ended' || s.status === 'ending') {
        void mic.current?.stop()
        mic.current = null
        refresh()
      }
    }
    const off = window.sanas.mockInterview.onChanged(receive)
    window.sanas.mockInterview
      .getState()
      .then(receive)
      .catch((e) => setError(errorText(e)))
    return () => {
      mounted.current = false
      off()
      void mic.current?.stop()
      mic.current = null
    }
  }, [])
  useEffect(() => {
    if (!visible) return
    window.sanas.mockInterview
      .setup()
      .then(setSetup)
      .catch((e) => setError(errorText(e)))
    window.sanas.jobs
      .list()
      .then((all) => {
        setJobs(all)
        setJobId((id) => (all.some((j) => j.id === id) ? id : (all[0]?.id ?? '')))
      })
      .catch((e) => setError(errorText(e)))
    refresh()
  }, [visible])
  useEffect(() => {
    if (meeting.status !== 'live') {
      void mic.current?.stop()
      mic.current = null
    }
  }, [meeting.status])
  const start = async (): Promise<void> => {
    if (jobId === '' || busy || importing || invalidResume) return
    setBusy(true)
    setError('')
    setSelected(null)
    try {
      const opened = await startCapturedMeeting(
        'this-pc',
        (channels) => window.sanas.mockInterview.start(plan, jobId, channels, resume),
        (s) => !['idle', 'ending', 'ended'].includes(s.status),
        true,
      )
      if (!mounted.current) {
        await opened.capture.stop()
        await window.sanas.mockInterview.end()
        return
      }
      mic.current = opened.capture
      setState(opened.result)
      setResume(null)
      setImportError('')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mock-page" style={{ display: 'grid', gap: 16 }}>
      <section className="card">
        <h2>Mock interview</h2>
        <p>
          Practice aloud with an AI interviewer guided by a plan, with follow-ups on your answers.
          Your selected job grounds Sanas’s suggestions.
        </p>
        <p className="notice">
          Headphones recommended. The microphone has no echo cancellation; speakers can feed the
          interviewer’s voice back into your mic. Uses your saved Claude and Deepgram keys and
          normal provider billing.
        </p>
        {setup && setup.missingKeys.length > 0 && (
          <p className="notice warn">
            Add {setup.missingKeys.join(' and ')} API keys in{' '}
            <button className="btn btn-sm" onClick={onSettings}>
              Settings
            </button>{' '}
            before starting.
          </p>
        )}
        <div className="live-toolbar">
          <label>
            Plan{' '}
            <select
              aria-label="Interview plan"
              value={plan}
              disabled={active || busy}
              onChange={(e) => setPlan(e.target.value as MockPlanId)}
            >
              {setup?.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Job{' '}
            <select
              aria-label="Practice job"
              value={jobId}
              disabled={active || busy}
              onChange={(e) => setJobId(Number(e.target.value))}
            >
              <option value="" disabled>
                Choose a job
              </option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-primary"
            disabled={
              !setup ||
              !!setup.missingKeys.length ||
              jobId === '' ||
              busy ||
              importing ||
              invalidResume ||
              active ||
              meeting.meetingId !== null
            }
            onClick={() => void start()}
          >
            {busy ? 'Starting…' : 'Start mock interview'}
          </button>
          {active && (
            <button
              className="btn btn-stop"
              onClick={() =>
                void window.sanas.mockInterview.end().catch((e) => setError(errorText(e)))
              }
            >
              End interview
            </button>
          )}
        </div>
        <MeetingResumeInput
          value={resume}
          onChange={setResume}
          disabled={active || busy}
          importing={importing}
          importError={importError}
          onImport={() => void importResume()}
        />
        {!jobs.length && <p>Create a job in Jobs first, then return here.</p>}
        <p>
          Start opens This PC capture and a separate interviewer window. Hear each question through
          your default output, then answer aloud and pause. Use Sanas’s overlay for suggestions and
          Screen capture.
        </p>
        <p>
          Skip: Ctrl+Alt+Right · End: Ctrl+Alt+End · Dismiss share: Ctrl+Alt+Backspace (or Escape in
          the interviewer window).
        </p>
        {active && (
          <p role="status">{state?.status === 'waiting' ? 'Listening to you' : state?.status}</p>
        )}
        {(error || state?.error) && (
          <p role="alert" className="notice warn">
            {error || state?.error}
          </p>
        )}
      </section>
      {!active && state?.result && !selected && <MockResults result={state.result} />}
      <section className="card">
        <h3>Past practice sessions</h3>
        {!past.length && <p>No saved practice sessions yet.</p>}
        {past.map((p) => (
          <button className="btn" key={p.meeting.id} onClick={() => setSelected(p)}>
            Practice · {p.meeting.title} · {p.meeting.startedAt}
          </button>
        ))}
      </section>
      {selected?.result && <MockResults result={selected.result} />}
      {selected && (
        <MeetingView
          meeting={selected.meeting}
          key={selected.meeting.id}
          onBack={() => {
            setSelected(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
