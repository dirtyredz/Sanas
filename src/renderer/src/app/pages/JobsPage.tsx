import { useEffect, useState } from 'react'
import type { Job } from '@shared/types'
import { JobDetail } from './JobDetail'
import { ApplicationPicker } from '../jobs/applications/ApplicationPicker'

export function JobsPage(): React.JSX.Element {
  const [jobs, setJobs] = useState<Job[]>([])
  const [newName, setNewName] = useState('')
  const [openJobId, setOpenJobId] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const refresh = (includeArchived = showArchived): Promise<void> =>
    window.sanas.jobs.list({ includeArchived }).then(setJobs)

  useEffect(() => {
    refresh(showArchived)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived])

  const create = async (): Promise<void> => {
    const name = newName.trim()
    if (!name) return
    const job = await window.sanas.jobs.create(name)
    setNewName('')
    await refresh()
    setOpenJobId(job.id)
  }

  const open = (jobId: number): void => {
    setImporting(false)
    setOpenJobId(jobId)
  }

  if (openJobId !== null) {
    return (
      <JobDetail
        jobId={openJobId}
        onBack={() => {
          setOpenJobId(null)
          refresh()
        }}
      />
    )
  }

  return (
    <div className="jobs-page">
      <div className="page-head">
        <h2>Jobs</h2>
        <p>One per employer or client — each carries its own context pack.</p>
      </div>

      <div className="job-create">
        <input
          placeholder="New job name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
        <button className="btn btn-primary" onClick={create} disabled={!newName.trim()}>
          Add job
        </button>
        <button className="btn" onClick={() => setImporting(true)} disabled={importing}>
          New job from application
        </button>
        <label className="hint">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />{' '}
          Show archived
        </label>
      </div>

      {importing && (
        <ApplicationPicker
          onCancel={() => {
            setImporting(false)
            refresh()
          }}
          onOpenJob={open}
          onApplied={(jobId) => {
            refresh()
            open(jobId)
          }}
        />
      )}

      {jobs.length === 0 && <p className="empty">No jobs yet — add your first one above.</p>}
      <div className="job-grid">
        {jobs.map((j) => (
          <button key={j.id} className="job-card" onClick={() => open(j.id)}>
            <span className="job-name">{j.name}</span>
            {(j.archived || j.applicationId) && (
              <span className="job-badges">
                {j.archived && <span className="badge">Archived</span>}
                {j.applicationId && <span className="badge badge--ok">From application</span>}
              </span>
            )}
            {j.persona && <span className="job-sub">{j.persona.slice(0, 90)}</span>}
            {j.summaryEmail && <span className="mail">✉ {j.summaryEmail}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
