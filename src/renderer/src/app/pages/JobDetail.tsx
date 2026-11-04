import { useEffect, useState } from 'react'
import type { Job, Meeting } from '@shared/types'
import { MeetingView } from './MeetingView'
import { errorText } from '../../lib/ipc-error'
import { PresentationEditor } from '../jobs/PresentationEditor'
import { JobOverview } from '../jobs/JobOverview'
import { JobResume } from '../jobs/JobResume'
import { JobEmail } from '../jobs/JobEmail'
import { JobMeetings } from '../jobs/JobMeetings'

import { JobTabs } from '../jobs/JobTabs'

export function JobDetail({
  jobId,
  onBack,
}: {
  jobId: number
  onBack: () => void
}): React.JSX.Element {
  const [job, setJob] = useState<Job | null>(null)

  const [tab, setTab] = useState(0)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [openMeeting, setOpenMeeting] = useState<Meeting | null>(null)

  useEffect(() => {
    window.sanas.jobs.list().then((all) => setJob(all.find((j) => j.id === jobId) ?? null))
    window.sanas.meetings.list(jobId).then(setMeetings)
  }, [jobId])

  if (openMeeting) {
    return (
      <MeetingView
        meeting={openMeeting}
        onBack={() => {
          setOpenMeeting(null)
          // meeting may have been renamed/moved/deleted while open
          window.sanas.meetings.list(jobId).then(setMeetings)
        }}
      />
    )
  }
  if (!job) return <p className="muted">Loading…</p>

  const save = async (): Promise<void> => {
    setSaveError('')
    try {
      // the reply is the stored row (trimmed name), so the form shows what was kept
      setJob(
        await window.sanas.jobs.update({
          id: job.id,
          name: job.name,
          companyInfo: job.companyInfo,
          projectScope: job.projectScope,
          notes: job.notes,
          talkingPoints: job.talkingPoints,
          persona: job.persona,
          summaryEmail: job.summaryEmail,
        }),
      )
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setSaveError(errorText(e))
    }
  }

  return (
    <div className="job-detail">
      <div className="detail-header">
        <button className="btn btn-ghost" onClick={onBack}>
          ← Jobs
        </button>
        <h2>{job.name}</h2>
        <div className="actions">
          {saveError && <span className="warn">{saveError}</span>}
          {saved && <span className="ok">Saved ✓</span>}
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={!job.name.trim()}
            title={job.name.trim() ? undefined : 'A job needs a name'}
          >
            Save
          </button>
        </div>
      </div>

      <JobTabs
        active={tab}
        onSelect={setTab}
        tabs={[
          { name: 'Overview', render: () => <JobOverview job={job} setJob={setJob} /> },
          { name: 'Resume', render: () => <JobResume key={jobId} jobId={jobId} /> },
          { name: 'Presentation', render: () => <PresentationEditor key={jobId} jobId={jobId} /> },
          { name: 'Email', render: () => <JobEmail job={job} setJob={setJob} /> },
          {
            name: 'Meetings',
            render: () => (
              <JobMeetings
                jobId={jobId}
                meetings={meetings}
                setMeetings={setMeetings}
                setOpenMeeting={setOpenMeeting}
              />
            ),
          },
        ]}
      />
    </div>
  )
}
