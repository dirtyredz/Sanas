import { useEffect, useState } from 'react'
import type { Job } from '@shared/types'
import { JobDetail } from './JobDetail'

export function JobsPage(): React.JSX.Element {
  const [jobs, setJobs] = useState<Job[]>([])
  const [newName, setNewName] = useState('')
  const [openJob, setOpenJob] = useState<Job | null>(null)

  const refresh = (): Promise<void> => window.sanas.jobs.list().then(setJobs)

  useEffect(() => {
    refresh()
  }, [])

  const create = async (): Promise<void> => {
    const name = newName.trim()
    if (!name) return
    const job = await window.sanas.jobs.create(name)
    setNewName('')
    await refresh()
    setOpenJob(job)
  }

  if (openJob) {
    return (
      <JobDetail
        jobId={openJob.id}
        onBack={() => {
          setOpenJob(null)
          refresh()
        }}
      />
    )
  }

  return (
    <div className="jobs">
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
      </div>

      {jobs.length === 0 && <p className="empty">No jobs yet — add your first one above.</p>}
      <div className="job-grid">
        {jobs.map((j) => (
          <button key={j.id} className="job-card" onClick={() => setOpenJob(j)}>
            <span className="job-name">{j.name}</span>
            {j.persona && <span className="job-sub">{j.persona.slice(0, 90)}</span>}
            {j.summaryEmail && <span className="mail">✉ {j.summaryEmail}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
