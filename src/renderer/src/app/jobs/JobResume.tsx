import { useEffect, useState } from 'react'
import type { MeetingResume } from '@shared/meeting-resume'
import { errorText } from '../../lib/ipc-error'
import { ResumeDraftEditor } from './ResumeDraftEditor'
import { resumeDraftProblem, sameResume } from './resume-draft'

/**
 * The job's saved resume. Every new Live or Mock meeting for this job snapshots what is saved
 * here at Start; meetings already started keep their own copy. Edits are a local draft until
 * "Save resume" (the header's Save does not cover this tab, like Presentation). A failed import
 * or save leaves the draft as it was.
 */
export function JobResume({ jobId }: { jobId: number }): React.JSX.Element {
  const [saved, setSaved] = useState<MeetingResume | null>(null)
  const [draft, setDraft] = useState<MeetingResume | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [importing, setImporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importError, setImportError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    setLoaded(false)
    window.sanas.jobs
      .getResume(jobId)
      .then((resume) => {
        if (!active) return
        setSaved(resume)
        setDraft(resume)
        setLoaded(true)
      })
      .catch((e) => active && setNotice(errorText(e)))
    return () => {
      active = false
    }
  }, [jobId])

  const importResume = async (): Promise<void> => {
    setImporting(true)
    setImportError('')
    try {
      const imported = await window.sanas.jobs.importResume()
      if (imported) setDraft(imported) // cancelled: keep the draft
    } catch (e) {
      setImportError(errorText(e))
    } finally {
      setImporting(false)
    }
  }
  const save = async (): Promise<void> => {
    setSaving(true)
    setNotice('')
    try {
      const stored = await window.sanas.jobs.setResume(jobId, draft)
      setSaved(stored)
      setDraft(stored)
      setNotice(
        stored
          ? 'Saved. New meetings for this job will use it; meetings already started keep theirs.'
          : 'Resume removed. New meetings for this job start without one.',
      )
    } catch (e) {
      setNotice(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  const dirty = !sameResume(saved, draft)
  return (
    <section className="card job-resume">
      <h2>Resume</h2>
      <p className="muted">
        Optional. Saved with this job and copied into each new Live or Mock meeting for it at Start,
        as candidate facts for answers and terminology hints for transcription. Only saved changes
        affect future meetings; the Save button above does not save this tab.
      </p>
      <fieldset disabled={!loaded || saving}>
        <ResumeDraftEditor
          value={draft}
          onChange={(next) => {
            setDraft(next)
            setNotice('')
          }}
          disabled={!loaded || saving}
          importing={importing}
          importError={importError}
          onImport={() => void importResume()}
        />
        <button
          className="btn"
          disabled={!dirty || importing || !!resumeDraftProblem(draft)}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save resume'}
        </button>
        {dirty && <span className="muted"> Unsaved changes</span>}
      </fieldset>
      <p role="status">{notice}</p>
    </section>
  )
}
