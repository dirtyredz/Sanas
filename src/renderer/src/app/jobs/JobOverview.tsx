import { JobMemory } from './memory/JobMemory'
import type { Job } from '@shared/types'
import { JobGlossary, useJobGlossary } from './JobGlossary'
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
  const glossary = useJobGlossary(jobId)

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
          terms={glossary.terms}
          onDirtyChange={onMemoryDirty}
        />
        <JobGlossary glossary={glossary} />
      </aside>
    </div>
  )
}
