import { JOB_MEMORY_MAX_CHARS } from '@shared/jobs/memory'
import type { useJobMemory } from './useJobMemory'

/** The owner-approved memory text and its explicit save. */
export function ApprovedMemoryEditor({
  jobId,
  m,
}: {
  jobId: number
  m: ReturnType<typeof useJobMemory>
}): React.JSX.Element {
  return (
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
        onClick={() => void m.run(() => window.sanas.memory.save(jobId, m.draftRevision, m.draft))}
      >
        Save memory
      </button>
    </>
  )
}
