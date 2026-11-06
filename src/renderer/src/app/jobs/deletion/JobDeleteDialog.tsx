import { useEffect, useState } from 'react'
import type { JobDeletionPreview } from '@shared/jobs/deletion'
import { errorText } from '../../../lib/ipc-error'
import { RECORDINGS_NOT_BACKED_UP, deletionLines, deletionOutcome } from './deletion-copy'

/**
 * Counted, destructive confirmation for deleting a job and everything recorded under it.
 * Main counts; this shows those exact counts, defaults to Cancel, disables a second submit
 * while one is pending, and stays open (with the reason) when deletion fails or is refused.
 */
export function JobDeleteDialog({
  jobId,
  onClose,
  onDeleted,
}: {
  jobId: number
  onClose: () => void
  onDeleted: () => void
}): React.JSX.Element {
  const [preview, setPreview] = useState<JobDeletionPreview | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true
    setPreview(null)
    window.sanas.jobs
      .deletePreview(jobId)
      .then((next) => active && setPreview(next))
      .catch((e) => active && setMessage(errorText(e)))
    return () => {
      active = false
    }
  }, [jobId, version])

  const confirm = async (): Promise<void> => {
    if (!preview?.token || pending) return
    setPending(true)
    try {
      const outcome = deletionOutcome(await window.sanas.jobs.delete(preview.token))
      setMessage(outcome.text)
      if (outcome.done) return onDeleted()
      setVersion((v) => v + 1) // the token is spent: count again before another attempt
    } catch (e) {
      setMessage(errorText(e))
      setVersion((v) => v + 1)
    } finally {
      setPending(false)
    }
  }

  const blocked = preview?.blocked
  return (
    <div
      className="confirm-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="job-delete-title"
      onKeyDown={(e) => e.key === 'Escape' && !pending && onClose()}
    >
      <h3 id="job-delete-title">Delete {preview?.jobName || 'this job'}?</h3>
      {!preview && !message && <p className="muted">Counting what would be deleted…</p>}
      {blocked && <p className="notice warn">{blocked.message}</p>}
      {preview && !blocked && (
        <>
          <p>This permanently deletes the job and everything recorded under it:</p>
          <ul className="confirm-counts">
            {deletionLines(preview.counts).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="notice warn">
            A database backup is taken first. {RECORDINGS_NOT_BACKED_UP}
          </p>
        </>
      )}
      {message && <p role="status">{message}</p>}
      <div className="actions">
        <button className="btn" autoFocus onClick={onClose} disabled={pending}>
          Cancel
        </button>
        <button
          className="btn btn-danger"
          onClick={() => void confirm()}
          disabled={pending || !preview?.token}
        >
          {pending ? 'Deleting…' : 'Delete job and history'}
        </button>
      </div>
    </div>
  )
}
