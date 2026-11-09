import { useEffect, useState } from 'react'
import type { Job, Meeting } from '@shared/types'
import { MeetingView } from './MeetingView'
import { errorText } from '../../lib/ipc-error'
import { JobOverview } from '../jobs/JobOverview'
import { JobResume } from '../jobs/JobResume'
import { JobEmail } from '../jobs/JobEmail'
import { JobMeetings } from '../jobs/JobMeetings'
import { JobTabs } from '../jobs/JobTabs'
import { JobDeleteDialog } from '../jobs/deletion/JobDeleteDialog'
import { ApplicationPreview } from '../jobs/applications/ApplicationPreview'
import { sameJobFields } from '../jobs/job-draft'

type Step = 'idle' | 'unsaved' | 'refresh' | 'delete'

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
  const [savedJob, setSavedJob] = useState<Job | null>(null)
  const [memoryDirty, setMemoryDirty] = useState(false)
  const [resumeDirty, setResumeDirty] = useState(false)
  const [step, setStep] = useState<Step>('idle')
  /** Bumped after an application refresh so the editors reload what was saved. */
  const [contentVersion, setContentVersion] = useState(0)

  const load = (): Promise<void> =>
    window.sanas.jobs.list({ includeArchived: true }).then((all) => {
      const found = all.find((j) => j.id === jobId) ?? null
      setJob(found)
      setSavedJob(found)
    })

  useEffect(() => {
    load()
    window.sanas.meetings.list(jobId).then(setMeetings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const jobDirty = !!savedJob && !sameJobFields(job, savedJob)

  const save = async (): Promise<boolean> => {
    setSaveError('')
    try {
      // the reply is the stored row (trimmed name), so the form shows what was kept
      const stored = await window.sanas.jobs.update({
        id: job.id,
        name: job.name,
        companyInfo: job.companyInfo,
        projectScope: job.projectScope,
        notes: job.notes,
        talkingPoints: job.talkingPoints,
        persona: job.persona,
        summaryEmail: job.summaryEmail,
      })
      setJob({ ...job, ...stored })
      setSavedJob({ ...job, ...stored })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      return true
    } catch (e) {
      setSaveError(errorText(e))
      return false
    }
  }

  // Never review an application refresh over unsaved edits: save or discard them first.
  const startRefresh = (): void =>
    setStep(jobDirty || resumeDirty || memoryDirty ? 'unsaved' : 'refresh')
  const discardAndRefresh = (): void => {
    if (savedJob) setJob(savedJob)
    setResumeDirty(false)
    setMemoryDirty(false)
    setContentVersion((v) => v + 1)
    setStep('refresh')
  }

  if (step === 'refresh' && job.applicationId)
    return (
      <ApplicationPreview
        applicationId={job.applicationId}
        onCancel={() => setStep('idle')}
        onApplied={() => {
          setStep('idle')
          setContentVersion((v) => v + 1)
          load()
        }}
      />
    )

  return (
    <div className="job-detail">
      <div className="detail-header">
        <button className="btn btn-ghost" onClick={onBack}>
          ← Jobs
        </button>
        <h2>
          {job.name}
          {job.archived && <span className="badge">Archived</span>}
        </h2>
        <div className="actions">
          {saveError && <span className="warn">{saveError}</span>}
          {saved && <span className="ok">Saved ✓</span>}
          {job.applicationId && (
            <button className="btn" onClick={startRefresh}>
              Refresh from application
            </button>
          )}
          <button className="btn btn-danger" onClick={() => setStep('delete')}>
            Delete job…
          </button>
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

      {step === 'unsaved' && (
        <div className="notice warn" role="alertdialog" aria-label="Unsaved changes">
          <p>
            Save or discard your unsaved changes before reviewing the application.
            {memoryDirty && ' Memory has its own Save memory button.'}
            {resumeDirty && ' The Resume tab has its own Save resume button.'}
          </p>
          <div className="actions">
            <button className="btn btn-sm" autoFocus onClick={() => setStep('idle')}>
              Cancel
            </button>
            {jobDirty && !resumeDirty && !memoryDirty && (
              <button
                className="btn btn-sm"
                onClick={async () => setStep((await save()) ? 'refresh' : 'idle')}
              >
                Save and review
              </button>
            )}
            <button className="btn btn-sm" onClick={discardAndRefresh}>
              Discard changes and review
            </button>
          </div>
        </div>
      )}

      {step === 'delete' && (
        <JobDeleteDialog jobId={job.id} onClose={() => setStep('idle')} onDeleted={onBack} />
      )}

      <JobTabs
        active={tab}
        onSelect={setTab}
        tabs={[
          {
            name: 'Overview',
            render: () => (
              <JobOverview
                key={`${jobId}-${contentVersion}`}
                job={job}
                setJob={setJob}
                savedNotes={savedJob?.notes ?? job.notes}
                onMemoryDirty={setMemoryDirty}
              />
            ),
          },
          {
            name: 'Resume',
            render: () => (
              <JobResume
                key={`${jobId}-${contentVersion}`}
                jobId={jobId}
                onDirtyChange={setResumeDirty}
              />
            ),
          },
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
