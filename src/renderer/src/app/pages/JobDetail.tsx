import { useEffect, useState } from 'react'
import type { GlossaryTerm, Job, Meeting } from '@shared/types'
import { MeetingView } from './MeetingView'
import { formatWhen } from '../../lib/format-time'

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
  const [openMeeting, setOpenMeeting] = useState<Meeting | null>(null)

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
    await window.sanas.jobs.update({
      id: job.id,
      name: job.name,
      companyInfo: job.companyInfo,
      projectScope: job.projectScope,
      notes: job.notes,
      talkingPoints: job.talkingPoints,
      persona: job.persona,
      summaryEmail: job.summaryEmail,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const addTerm = async (): Promise<void> => {
    const term = newTerm.trim()
    if (!term) return
    const t = await window.sanas.glossary.add(jobId, term, '')
    setTerms((prev) => [...prev, t].sort((a, b) => a.term.localeCompare(b.term)))
    setNewTerm('')
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
          aria-label="Job name"
          onChange={(e) => setJob({ ...job, name: e.target.value })}
        />
        <div className="actions">
          {saved && <span className="ok">Saved ✓</span>}
          <button className="btn btn-primary" onClick={save}>
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
            <div className="meeting-list">
              {meetings.map((m) => (
                <button key={m.id} className="meeting-row" onClick={() => setOpenMeeting(m)}>
                  <span>{m.title}</span>
                  <span className="when">{formatWhen(m.startedAt)}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
