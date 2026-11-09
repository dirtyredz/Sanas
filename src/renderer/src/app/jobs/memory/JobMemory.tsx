import { useEffect } from 'react'
import type { GlossaryTerm } from '@shared/types'
import { useJobMemory } from './useJobMemory'
import { ContextSizeMeter } from './ContextSizeMeter'
import { ApprovedMemoryEditor } from './ApprovedMemoryEditor'
import { MemoryProposalReview } from './MemoryProposalReview'

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
  const v = m.view
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
              <ApprovedMemoryEditor jobId={jobId} m={m} />
              <MemoryProposalReview jobId={jobId} view={v} m={m} />
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
