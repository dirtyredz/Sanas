import { useEffect, useState } from 'react'
import type { GlossaryTerm, Job } from '@shared/types'
import { parseGlossaryInput } from '../../lib/glossary-input'
const PACK_FIELDS = [
  { key: 'companyInfo', label: 'Company info', hint: 'Who they are, org quirks, key people' },
  { key: 'projectScope', label: 'Project scope', hint: 'What you are building or doing for them' },
  { key: 'notes', label: 'Notes', hint: 'Anything else the assistant should know' },
  { key: 'talkingPoints', label: 'Talking points', hint: 'Things to steer toward (or avoid)' },
  { key: 'persona', label: 'Persona / tone', hint: 'How you want to come across' },
] as const

export function JobOverview({
  job,
  setJob,
}: {
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
            maxLength={120}
            aria-label="Job name"
            onChange={(e) => setJob({ ...job, name: e.target.value })}
          />
        </label>
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
      </div>
      <aside className="side">
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
