import { JobMemory } from './memory/JobMemory'
import { useEffect, useState } from 'react'
import type { GlossaryTerm, Job } from '@shared/types'
import { parseGlossaryInput } from '../../lib/glossary-input'
import {
  JOB_CONTEXT_MAX_CHARS,
  JOB_NAME_MAX_CHARS,
  JOB_PERSONA_MAX_CHARS,
} from '@shared/jobs/limits'
const PACK_FIELDS = [
  { key: 'companyInfo', label: 'Company info', hint: 'Who they are, org quirks, key people' },
  { key: 'projectScope', label: 'Project scope', hint: 'What you are building or doing for them' },
  {
    key: 'notes',
    label: 'Notes',
    hint: 'Candidate facts: employer/project, dates, personal role, technologies, scale, outcomes, limits and uncertainties; source and date',
  },
  { key: 'talkingPoints', label: 'Talking points', hint: 'Things to steer toward (or avoid)' },
  { key: 'persona', label: 'Persona / tone', hint: 'How you want to come across' },
] as const

export function JobOverview({
  job,
  setJob,
  savedNotes,
  onMemoryDirty,
}: {
  savedNotes: string
  onMemoryDirty: (dirty: boolean) => void
  job: Job
  setJob: (job: Job) => void
}): React.JSX.Element {
  const jobId = job.id
  const [terms, setTerms] = useState<GlossaryTerm[]>([])
  const [newTerm, setNewTerm] = useState('')
  const [glossaryNotice, setGlossaryNotice] = useState('')

  useEffect(() => {
    window.sanas.glossary.list(jobId).then(setTerms)
  }, [jobId])
  useEffect(() => {
    if (!glossaryNotice) return
    const timeout = window.setTimeout(() => setGlossaryNotice(''), 3000)
    return () => window.clearTimeout(timeout)
  }, [glossaryNotice])

  const addTerm = async (): Promise<void> => {
    const parsed = parseGlossaryInput(
      newTerm,
      terms.map((term) => term.term),
    )
    if (parsed.terms.length === 0 && parsed.alreadyThere === 0) return

    const added: GlossaryTerm[] = []
    for (const term of parsed.terms) {
      added.push(await window.sanas.glossary.add(jobId, term, ''))
    }

    setTerms((prev) => [...prev, ...added].sort((a, b) => a.term.localeCompare(b.term)))
    setNewTerm('')
    setGlossaryNotice(`Added ${added.length} · ${parsed.alreadyThere} already there`)
  }

  return (
    <div className="detail-columns">
      <div className="pack">
        <label className="field">
          <span className="label">Job name</span>{' '}
          <input
            className="title-input"
            value={job.name}
            maxLength={JOB_NAME_MAX_CHARS}
            aria-label="Job name"
            onChange={(e) => setJob({ ...job, name: e.target.value })}
          />
        </label>
        <section className="pack">
          <div>
            <span className="eyebrow">Context pack</span>
            <p className="hint">Fed to the AI on every suggestion and summary for this job.</p>
          </div>
          <details>
            <summary>Interview context pack guidance</summary>
            <p className="hint">
              Put verified candidate facts in Notes, separating personal work from team work.
              Template: employer/project; dates; my role; technologies; actual scale and outcomes;
              limits; source/date. Keep uncertain facts qualified.
            </p>
            <p className="hint">
              Project scope: target role and job description. Company info: target client. Persona:
              candidate role and concise screening delivery. Talking points: optional priorities,
              not the sole home of biography.
            </p>
            <p className="hint">
              Add confirmed employer and technology names to Glossary. Use meeting context and Apply
              for the recruiter, call stage, temporary logistics and verified corrections. Mock
              examples are fictional, not your resume.
            </p>
          </details>
          {!job.notes.trim() && (
            <p className="notice">
              No candidate facts supplied in Notes. Add verified experience before an interview.
            </p>
          )}
          {PACK_FIELDS.map((f) => (
            <label key={f.key} className="field">
              <span className="label">{f.label}</span>
              <textarea
                rows={f.key === 'persona' ? 2 : 4}
                maxLength={f.key === 'persona' ? JOB_PERSONA_MAX_CHARS : JOB_CONTEXT_MAX_CHARS}
                placeholder={f.hint}
                value={job[f.key]}
                onChange={(e) => setJob({ ...job, [f.key]: e.target.value })}
              />
            </label>
          ))}
        </section>
      </div>
      <aside className="side">
        <JobMemory
          jobId={jobId}
          notes={savedNotes}
          draftNotes={job.notes}
          terms={terms}
          onDirtyChange={onMemoryDirty}
        />
        <section>
          <span className="eyebrow">Glossary</span>
          <p className="hint">Jargon, product names, acronyms — these also boost transcription.</p>
          <div className="row glossary-add">
            <textarea
              rows={2}
              placeholder="Add term…"
              value={newTerm}
              onChange={(e) => setNewTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void addTerm()
                }
              }}
            />
            <button
              className="btn btn-sm"
              onClick={() => void addTerm()}
              disabled={!newTerm.trim()}
            >
              Add
            </button>
          </div>
          {glossaryNotice && <p className="hint glossary-notice">{glossaryNotice}</p>}
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
      </aside>
    </div>
  )
}
