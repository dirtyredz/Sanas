import { useEffect, useState } from 'react'
import type { GlossaryTerm, Job, Meeting } from '@shared/types'
import { MeetingView } from './MeetingView'

const PACK_FIELDS = [
  { key: 'companyInfo', label: 'Company info', hint: 'Who they are, org quirks, key people' },
  { key: 'projectScope', label: 'Project scope', hint: 'What you are building/doing for them' },
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
        <button className="back" onClick={onBack}>
          ← Jobs
        </button>
        <input
          className="job-title"
          value={job.name}
          onChange={(e) => setJob({ ...job, name: e.target.value })}
        />
        <button onClick={save}>Save</button>
        {saved && <span className="ok">Saved ✓</span>}
      </div>

      <div className="detail-columns">
        <section className="pack">
          <h3>Context pack</h3>
          <p className="muted">Fed to the AI on every suggestion for this job.</p>
          {PACK_FIELDS.map((f) => (
            <label key={f.key}>
              {f.label}
              <textarea
                rows={f.key === 'persona' ? 2 : 4}
                placeholder={f.hint}
                value={job[f.key]}
                onChange={(e) => setJob({ ...job, [f.key]: e.target.value })}
              />
            </label>
          ))}
        </section>

        <section className="side">
          <h3>Summary email</h3>
          <p className="muted">Meeting summaries for this job go here. Blank = no email.</p>
          <input
            type="email"
            placeholder="client@example.com"
            value={job.summaryEmail}
            onChange={(e) => setJob({ ...job, summaryEmail: e.target.value })}
          />

          <h3>Glossary</h3>
          <p className="muted">Jargon, product names, acronyms — also boosts transcription.</p>
          <div className="job-create">
            <input
              placeholder="Add term…"
              value={newTerm}
              onChange={(e) => setNewTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTerm()}
            />
            <button onClick={addTerm}>Add</button>
          </div>
          <div className="term-list">
            {terms.map((t) => (
              <span key={t.id} className="chip term">
                {t.term}
                <button
                  className="x"
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

          <h3>Meetings</h3>
          {meetings.length === 0 && <p className="muted">None yet.</p>}
          <div className="meeting-list">
            {meetings.map((m) => (
              <button key={m.id} className="meeting-row" onClick={() => setOpenMeeting(m)}>
                <span>{m.title}</span>
                <span className="muted">{m.startedAt}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
