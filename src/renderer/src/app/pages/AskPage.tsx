import { useEffect, useRef, useState } from 'react'
import type { HistoryHit, Job, Meeting } from '@shared/types'
import { MeetingView } from './MeetingView'
import { formatClock, formatWhen } from '../../lib/format-time'

interface Exchange {
  askId: number
  question: string
  answer: string
  sources: HistoryHit[]
  streaming: boolean
  error: string | null
}

/** IPC rejections arrive as "Error invoking remote method 'x': Error: <msg>" — keep <msg>. */
function errorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.replace(/^Error invoking remote method '[^']*': (Error: )?/, '')
}

export function AskPage(): React.JSX.Element {
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobId, setJobId] = useState<number | ''>('')
  const [question, setQuestion] = useState('')
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [openMeeting, setOpenMeeting] = useState<Meeting | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.sanas.jobs.list().then(setJobs)
  }, [])

  // answers stream in by askId; a page can hold several exchanges
  useEffect(
    () =>
      window.sanas.history.onEvent((ev) => {
        setExchanges((prev) =>
          prev.map((x) => {
            if (x.askId !== ev.askId) return x
            if (ev.kind === 'delta') return { ...x, answer: x.answer + ev.text }
            if (ev.kind === 'done') return { ...x, answer: ev.text, streaming: false }
            return { ...x, streaming: false, error: ev.text }
          }),
        )
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
    try {
      const { askId, sources } = await window.sanas.history.ask(q, jobId === '' ? undefined : jobId)
      setExchanges((prev) => [
        ...prev,
        { askId, question: q, answer: '', sources, streaming: true, error: null },
      ])
    } catch (e) {
      setExchanges((prev) => [
        ...prev,
        {
          askId: -Date.now(),
          question: q,
          answer: '',
          sources: [],
          streaming: false,
          error: errorText(e),
        },
      ])
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
