import { useEffect } from 'react'
import { JOB_MEMORY_MAX_CHARS } from '@shared/jobs/memory'
import type { GlossaryTerm } from '@shared/types'
import { useJobMemory } from './useJobMemory'
import { ContextSizeMeter } from './ContextSizeMeter'

export function JobMemory({
  jobId,
  notes,
  draftNotes,
  terms,
  onDirtyChange,
}: {
  jobId: number
  notes: string
  draftNotes: string
  terms: GlossaryTerm[]
  onDirtyChange: (dirty: boolean) => void
}): React.JSX.Element {
  const m = useJobMemory(jobId)
  useEffect(() => {
    onDirtyChange(m.dirty)
  }, [m.dirty, onDirtyChange])
  const v = m.view,
    p = v?.proposals[0]
  return (
    <section className="pack" aria-label="Job memory">
      <span className="eyebrow">Job memory</span>
      {m.error && (
        <p role="alert" className="warn">
          {m.error} Your edits are kept.
        </p>
      )}
      {!v ? (
        <p>Loading memory…</p>
      ) : (
        <>
          <ContextSizeMeter
            notes={notes}
            draftNotes={draftNotes}
            memory={v.approved.text}
            terms={terms}
          />
          {!v.eligible ? (
            <p className="hint">Unsorted does not use job memory.</p>
          ) : (
            <>
              <p className="hint">
                Owner-approved historical context. Saved changes apply to future meetings only.
              </p>
              <label className="field">
                <span className="label">Saved memory</span>
                <textarea
                  rows={5}
                  value={m.draft}
                  maxLength={JOB_MEMORY_MAX_CHARS}
                  onChange={(e) => m.editDraft(e.target.value)}
                />
              </label>
              <p className="hint">
                {m.draft.length} / {JOB_MEMORY_MAX_CHARS} characters
              </p>
              <button
                className="btn"
                disabled={m.busy}
                onClick={() =>
                  void m.run(() => window.sanas.memory.save(jobId, m.draftRevision, m.draft))
                }
              >
                Save memory
              </button>
              {p && (
                <section>
                  <h3>Proposed replacement · {v.proposals.length} remaining</h3>
                  <p>
                    {p.title} · {p.startedAt.slice(0, 10)} · {p.status}
                  </p>
                  <details>
                    <summary>Currently approved memory</summary>
                    <pre>{v.approved.text || '(empty)'}</pre>
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
                          window.sanas.memory.approve(jobId, {
                            ...m.proposalIdentity!,
                            text: m.proposal,
                          }),
                        )
                      }
                    >
                      Approve replacement
                    </button>
                    <button
                      className="btn"
                      disabled={m.busy}
                      onClick={() =>
                        void m.run(() =>
                          window.sanas.memory.dismiss(jobId, p.meetingId, p.generation),
                        )
                      }
                    >
                      Dismiss
                    </button>
                    <button
                      className="btn"
                      disabled={m.busy || p.status === 'generating'}
                      onClick={() =>
                        void m.run(() => window.sanas.memory.retry(jobId, p.meetingId), false)
                      }
                    >
                      Regenerate
                    </button>
                  </div>
                </section>
              )}
              <button
                className="btn btn-ghost"
                disabled={m.busy}
                onClick={() => void m.run(() => window.sanas.memory.get(jobId))}
              >
                Reload and discard memory edits
              </button>
            </>
          )}
        </>
      )}
    </section>
  )
}
