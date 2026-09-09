import { useEffect, useRef, useState } from 'react'
import type { HistoryEvent, HistoryHit, Job, Meeting } from '@shared/types'
import { MeetingView } from './MeetingView'
import { formatClock, formatWhen } from '../../lib/format-time'
import { errorText } from '../../lib/ipc-error'

interface Exchange {
  /** Negative while the ask is in flight (placeholder), then main's askId. */
  askId: number
  question: string
  answer: string
  sources: HistoryHit[]
  streaming: boolean
  error: string | null
}

function apply(x: Exchange, ev: HistoryEvent): Exchange {
  if (ev.kind === 'delta') return { ...x, answer: x.answer + ev.text }
  if (ev.kind === 'done') return { ...x, answer: ev.text, streaming: false }
  return { ...x, streaming: false, error: ev.text }
}

export function AskPage(): React.JSX.Element {
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobId, setJobId] = useState<number | ''>('')
  const [question, setQuestion] = useState('')
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [openMeeting, setOpenMeeting] = useState<Meeting | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  // Main may stream before the invoke that returns askId has resolved; events for an
  // askId we do not know yet wait here and replay once the exchange has its id.
  const known = useRef(new Set<number>())
  const early = useRef(new Map<number, HistoryEvent[]>())

  useEffect(() => {
    window.sanas.jobs.list().then(setJobs)
  }, [])

  useEffect(
    () =>
      window.sanas.history.onEvent((ev) => {
        if (!known.current.has(ev.askId)) {
          early.current.set(ev.askId, [...(early.current.get(ev.askId) ?? []), ev])
          return
        }
        setExchanges((prev) => prev.map((x) => (x.askId === ev.askId ? apply(x, ev) : x)))
      }),
    [],
  )

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [exchanges])

  const busy = exchanges.some((x) => x.streaming)

  const ask = async (): Promise<void> => {
    const q = question.trim()
    if (!q || busy) return
    setQuestion('')
    const temp = -Date.now()
    setExchanges((prev) => [
      ...prev,
      { askId: temp, question: q, answer: '', sources: [], streaming: true, error: null },
    ])
    try {
      const { askId, sources } = await window.sanas.history.ask(q, jobId === '' ? undefined : jobId)
      known.current.add(askId)
      const buffered = early.current.get(askId) ?? []
      early.current.delete(askId)
      setExchanges((prev) =>
        prev.map((x) => (x.askId === temp ? buffered.reduce(apply, { ...x, askId, sources }) : x)),
      )
    } catch (e) {
      setExchanges((prev) =>
        prev.map((x) => (x.askId === temp ? { ...x, streaming: false, error: errorText(e) } : x)),
      )
    }
  }

  if (openMeeting) return <MeetingView meeting={openMeeting} onBack={() => setOpenMeeting(null)} />

  return (
    <div className="ask-page">
      <div className="page-head">
        <h2>Ask</h2>
        <p>Questions about anything said in past meetings, answered from the transcripts.</p>
      </div>

      <div className="ask-box">
        <select
          value={jobId}
          aria-label="Scope"
          onChange={(e) => setJobId(e.target.value === '' ? '' : Number(e.target.value))}
        >
          <option value="">All jobs</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </select>
        <input
          autoFocus
          placeholder="What did we decide about…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
        />
        <button className="btn btn-primary" onClick={ask} disabled={busy || !question.trim()}>
          {busy ? 'Answering…' : 'Ask'}
        </button>
      </div>

      <div className="exchanges">
        {exchanges.length === 0 && (
          <p className="empty">
            Try “what did Dana say about the November deadline?” or “which action items are still
            open for Lumen?”
          </p>
        )}
        {exchanges.map((x) => (
          <article key={x.askId} className="exchange">
            <p className="question">{x.question}</p>
            {x.error ? (
              <p className="notice warn">{x.error}</p>
            ) : (
              <p className={`answer ${x.streaming ? 'streaming' : ''}`}>
                {x.answer}
                {x.streaming && <span className="cursor">▍</span>}
              </p>
            )}
            {x.sources.length > 0 && (
              <div className="sources">
                <span className="eyebrow">From</span>
                {x.sources.map((s) => (
                  <button
                    key={s.meetingId}
                    className="chip"
                    title={s.snippet}
                    onClick={() =>
                      window.sanas.meetings.get(s.meetingId).then((m) => m && setOpenMeeting(m))
                    }
                  >
                    {s.title} · {formatWhen(s.startedAt)} · {formatClock(s.tStartMs)}
                  </button>
                ))}
              </div>
            )}
          </article>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}
