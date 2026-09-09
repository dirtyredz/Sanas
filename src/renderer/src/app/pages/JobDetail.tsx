import { useEffect, useState } from 'react'
import type { GlossaryTerm, Job, Meeting } from '@shared/types'
import { MeetingView } from './MeetingView'
import { formatWhen } from '../../lib/format-time'
import { errorText } from '../../lib/ipc-error'

const PACK_FIELDS = [
  { key: 'companyInfo', label: 'Company info', hint: 'Who they are, org quirks, key people' },
  { key: 'projectScope', label: 'Project scope', hint: 'What you are building or doing for them' },
  { key: 'notes', label: 'Notes', hint: 'Anything else the assistant should know' },
  { key: 'talkingPoints', label: 'Talking points', hint: 'Things to steer toward (or avoid)' },
  { key: 'persona', label: 'Persona / tone', hint: 'How you want to come across' },
] as const

export function JobDetail({
  jobId,
  onBack,
}: {
  jobId: number
  onBack: () => void
}): React.JSX.Element {
  const [job, setJob] = useState<Job | null>(null)
  const [terms, setTerms] = useState<GlossaryTerm[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [newTerm, setNewTerm] = useState('')
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [openMeeting, setOpenMeeting] = useState<Meeting | null>(null)
  // merging folds split recordings back into one meeting; it cannot be undone, so the
  // button asks once before it runs
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [confirmMerge, setConfirmMerge] = useState(false)
  const [mergeError, setMergeError] = useState('')
  const [mergeNotice, setMergeNotice] = useState('')

  useEffect(() => {
    window.sanas.jobs.list().then((all) => setJob(all.find((j) => j.id === jobId) ?? null))
    window.sanas.glossary.list(jobId).then(setTerms)
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

  const addTerm = async (): Promise<void> => {
    const term = newTerm.trim()
    if (!term) return
    const t = await window.sanas.glossary.add(jobId, term, '')
    setTerms((prev) => [...prev, t].sort((a, b) => a.term.localeCompare(b.term)))
    setNewTerm('')
  }

  const togglePick = (id: number): void => {
    setConfirmMerge(false)
    setMergeError('')
    setMergeNotice('')
    setPicked((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  const merge = async (): Promise<void> => {
    setMergeError('')
    setMergeNotice('')
    try {
      const { meeting, recordingsLeftBehind } = await window.sanas.meetings.merge([...picked])
      setPicked(new Set())
      setConfirmMerge(false)
      setMeetings(await window.sanas.meetings.list(jobId))
      if (recordingsLeftBehind > 0) {
        // stay on the list so the warning is actually read; the merged meeting is one click away
        setMergeNotice(
          `Merged into "${meeting.title}". ${recordingsLeftBehind} recording(s) are still in use ` +
            'by another program — clean-up will remove them later.',
        )
      } else {
        setOpenMeeting(meeting) // show the result straight away
      }
    } catch (e) {
      setConfirmMerge(false)
      setMergeError(errorText(e))
    }
  }

  return (
    <div className="job-detail">
      <div className="detail-header">
        <button className="btn btn-ghost" onClick={onBack}>
          ← Jobs
        </button>
        <input
          className="title-input"
          value={job.name}
          maxLength={120}
          aria-label="Job name"
          onChange={(e) => setJob({ ...job, name: e.target.value })}
        />
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

      <div className="detail-columns">
        <section className="pack">
          <div>
            <span className="eyebrow">Context pack</span>
            <p className="hint">Fed to the AI on every suggestion and summary for this job.</p>
          </div>
          {PACK_FIELDS.map((f) => (
            <label key={f.key} className="field">
              <span className="label">{f.label}</span>
              <textarea
                rows={f.key === 'persona' ? 2 : 4}
                placeholder={f.hint}
                value={job[f.key]}
                onChange={(e) => setJob({ ...job, [f.key]: e.target.value })}
              />
            </label>
          ))}
        </section>

        <aside className="side">
          <section>
            <span className="eyebrow">Summary email</span>
            <label className="field">
              <input
                type="email"
                placeholder="client@example.com"
                value={job.summaryEmail}
                onChange={(e) => setJob({ ...job, summaryEmail: e.target.value })}
              />
              <small>Meeting summaries for this job go here. Blank means no email.</small>
            </label>
          </section>

          <section>
            <span className="eyebrow">Glossary</span>
            <p className="hint">
              Jargon, product names, acronyms — these also boost transcription.
            </p>
            <div className="row">
              <input
                placeholder="Add term…"
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTerm()}
              />
              <button className="btn btn-sm" onClick={addTerm} disabled={!newTerm.trim()}>
                Add
              </button>
            </div>
            <div className="term-list">
              {terms.map((t) => (
                <span key={t.id} className="chip">
                  {t.term}
                  <button
                    className="x"
                    aria-label={`Remove ${t.term}`}
                    onClick={() => {
                      window.sanas.glossary.remove(t.id)
                      setTerms((prev) => prev.filter((p) => p.id !== t.id))
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </section>

          <section>
            <span className="eyebrow">Meetings</span>
            {meetings.length === 0 && <p className="hint">None yet.</p>}
            {meetings.length > 1 && (
              <p className="hint">Tick two or more to fold a split recording back into one.</p>
            )}
            <div className="meeting-list">
              {meetings.map((m) => (
                <div key={m.id} className="meeting-pick">
                  {meetings.length > 1 && (
                    <input
                      type="checkbox"
                      checked={picked.has(m.id)}
                      aria-label={`Select ${m.title} for merging`}
                      onChange={() => togglePick(m.id)}
                    />
                  )}
                  <button className="meeting-row" onClick={() => setOpenMeeting(m)}>
                    <span>{m.title}</span>
                    <span className="when">{formatWhen(m.startedAt)}</span>
                  </button>
                </div>
              ))}
            </div>
            {picked.size >= 2 && (
              <div className="row merge-bar">
                {confirmMerge ? (
                  <>
                    <span className="warn">
                      Fold {picked.size} into the earliest? This cannot be undone.
                    </span>
                    <button className="btn btn-sm btn-stop" onClick={merge}>
                      Merge
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setConfirmMerge(false)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-sm" onClick={() => setConfirmMerge(true)}>
                      Merge {picked.size} meetings
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => setPicked(new Set())}
                      title="Clear the selection"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            )}
            {mergeError && <p className="notice warn">{mergeError}</p>}
            {mergeNotice && <p className="notice warn">{mergeNotice}</p>}
          </section>
        </aside>
      </div>
    </div>
  )
}
