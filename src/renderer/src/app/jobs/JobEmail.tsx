import type { Job } from '@shared/types'
export function JobEmail({
  job,
  setJob,
}: {
  job: Job
  setJob: (job: Job) => void
}): React.JSX.Element {
  return (
    <div className="side">
      {' '}
      <section>
        <span className="eyebrow">Summary email</span>
        <label className="field">
          <input
            type="email"
            aria-label="Summary email"
            placeholder="client@example.com"
            value={job.summaryEmail}
            onChange={(e) => setJob({ ...job, summaryEmail: e.target.value })}
          />
          <small>Meeting summaries for this job go here. Blank means no email.</small>
        </label>
      </section>
    </div>
  )
}
