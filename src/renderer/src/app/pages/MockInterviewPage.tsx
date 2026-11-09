import type { MockPlanId } from '@shared/mock-interview/types'
import { errorText } from '../../lib/ipc-error'
import { MockResults } from '../mock-interview/MockResults'
import { useMockInterview } from '../mock-interview/useMockInterview'
import { MeetingView } from './MeetingView'

export function MockInterviewPage({
  visible,
  onSettings,
}: {
  visible: boolean
  onSettings(): void
}): React.JSX.Element {
  const {
    meetingOpen,
    setup,
    jobs,
    jobId,
    setJobId,
    plan,
    setPlan,
    state,
    past,
    selected,
    setSelected,
    busy,
    error,
    setError,
    active,
    refresh,
    start,
  } = useMockInterview(visible)
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
              !setup || !!setup.missingKeys.length || jobId === '' || busy || active || meetingOpen
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
        <p className="muted">
          Sanas answers from the selected job’s saved resume. Add or change it on that job’s Resume
          tab in Jobs; each practice session keeps the resume it started with.
        </p>
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
