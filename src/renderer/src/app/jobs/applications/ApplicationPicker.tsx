import { useState } from 'react'
import { REFRESH_FAILED_TITLE } from '@shared/jobs/applications'
import { ApplicationPreview } from './ApplicationPreview'
import { formatUpdated, rowView } from './picker-rows'
import { useApplicationListing } from './useApplicationListing'

/**
 * New job from application: refreshes the resumes interview packs, lists them, and opens a
 * create/refresh preview for the one chosen. A failed refresh still lists the packs already on
 * disk, under a warning with Retry.
 */
export function ApplicationPicker({
  onCancel,
  onOpenJob,
  onApplied,
}: {
  onCancel: () => void
  onOpenJob: (jobId: number) => void
  onApplied: (jobId: number) => void
}): React.JSX.Element {
  const { listing, refreshing, error, refresh } = useApplicationListing()
  const [selected, setSelected] = useState<string | null>(null)

  if (selected)
    return (
      <ApplicationPreview
        applicationId={selected}
        onCancel={() => setSelected(null)}
        onApplied={onApplied}
      />
    )

  return (
    <section className="card import-picker" aria-labelledby="import-picker-title">
      <div className="import-picker-head">
        <h3 id="import-picker-title">New job from application</h3>
        <div className="actions">
          <button className="btn btn-sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="btn btn-sm" onClick={onCancel}>
            Close
          </button>
        </div>
      </div>
      {refreshing && <p className="muted">Refreshing interview packs from resumes…</p>}
      {error && <p className="notice warn">{error}</p>}
      {listing && !listing.refresh.ok && (
        <p className="notice warn">
          {REFRESH_FAILED_TITLE}: {listing.refresh.message}{' '}
          {listing.folder !== 'invalid-settings' && 'Showing the packs already on disk. '}
          <button className="btn btn-sm" onClick={refresh} disabled={refreshing}>
            Retry
          </button>
        </p>
      )}
      {listing?.folderError && listing.folder !== 'invalid-settings' && (
        <p className="notice warn">{listing.folderError}</p>
      )}
      {listing?.limited && (
        <p className="notice warn">
          There are more packs than Sanas lists at once; some are not shown.
        </p>
      )}
      {listing && listing.packs.length === 0 && listing.folder !== 'invalid-settings' && (
        <p className="empty">
          No interview packs yet. Applications at the interview or offer stage appear here once the
          resumes project writes them to job-hunt\sanas in {listing.sourceRoot}.
        </p>
      )}
      <ul className="import-rows">
        {listing?.packs.map((row) => {
          const view = rowView(row)
          return (
            <li key={row.applicationId} className="import-row">
              <div>
                <span className="job-name">{row.company || row.applicationId}</span>
                {row.role && <span className="job-sub"> · {row.role}</span>}
                <span className="hint">
                  {' '}
                  {row.stage ?? 'unknown stage'} · updated {formatUpdated(row.updatedAt)}
                  {row.jobName && ` · ${row.jobName}`}
                </span>
                {view.badges.map((b) => (
                  <span key={b.label} className={`badge badge--${b.tone}`}>
                    {b.label}
                  </span>
                ))}
                {view.hint && <p className="hint">{view.hint}</p>}
              </div>
              {view.action !== 'none' && (
                <button
                  className="btn btn-sm"
                  disabled={refreshing}
                  onClick={() =>
                    view.action === 'open' && row.jobId !== null
                      ? onOpenJob(row.jobId)
                      : setSelected(row.applicationId)
                  }
                >
                  {view.label}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
