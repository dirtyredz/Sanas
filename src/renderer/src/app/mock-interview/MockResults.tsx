import type { MockResult } from '@shared/mock-interview/types'

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
