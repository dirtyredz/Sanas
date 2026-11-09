import { JOB_MEMORY_MAX_CHARS, type JobMemoryView } from '@shared/jobs/memory'
import type { useJobMemory } from './useJobMemory'

/** Review of the oldest proposed replacement: edit, approve, dismiss or regenerate. */
export function MemoryProposalReview({
  jobId,
  view,
  m,
}: {
  jobId: number
  view: JobMemoryView
  m: ReturnType<typeof useJobMemory>
}): React.JSX.Element | null {
  const p = view.proposals[0]
  if (!p) return null
  return (
    <section>
      <h3>Proposed replacement · {view.proposals.length} remaining</h3>
      <p>
        {p.title} · {p.startedAt.slice(0, 10)} · {p.status}
      </p>
      <details>
        <summary>Currently approved memory</summary>
        <pre>{view.approved.text || '(empty)'}</pre>
      </details>
      <label className="field">
        <span className="label">Proposed memory</span>
        <textarea
          rows={6}
          value={m.proposal}
          maxLength={JOB_MEMORY_MAX_CHARS}
          onChange={(e) => m.editProposal(e.target.value)}
        />
      </label>
      <p className="hint">
        {m.proposal.length} / {JOB_MEMORY_MAX_CHARS} characters. Review oldest first.
      </p>
      <div className="actions">
        <button
          className="btn"
          disabled={
            m.busy ||
            p.status !== 'pending' ||
            !m.proposalIdentity ||
            m.proposalIdentity.generation !== p.generation
          }
          onClick={() =>
            void m.run(() =>
              window.sanas.memory.approve(jobId, { ...m.proposalIdentity!, text: m.proposal }),
            )
          }
        >
          Approve replacement
        </button>
        <button
          className="btn"
          disabled={m.busy}
          onClick={() =>
            void m.run(() => window.sanas.memory.dismiss(jobId, p.meetingId, p.generation))
          }
        >
          Dismiss
        </button>
        <button
          className="btn"
          disabled={m.busy || p.status === 'generating'}
          onClick={() => void m.run(() => window.sanas.memory.retry(jobId, p.meetingId), false)}
        >
          Regenerate
        </button>
      </div>
    </section>
  )
}
