import type { MeetingResume } from '@shared/meeting-resume'
import {
  JUDGEMENT_FIELDS,
  type JobTextField,
  type JudgementField,
  type ValueSource,
} from '@shared/jobs/applications'
import { JOB_NAME_MAX_CHARS } from '@shared/jobs/limits'
import { fitKeyterms } from '../../stt/keyterm-budget'
import { validateResume } from '../resume/resume'
import type { ValidPack } from './source/validate-pack'

// Converts a validated pack into what a job stores. Notes carry only the producer's verified
// master facts; the resume is separate candidate material and never feeds Notes. Company,
// role and the JD link stay source metadata (shown in the preview, not appended to Notes).

/** The source side of an import: what the pack says each job value should be. */
export interface SourceValues {
  fields: Record<JobTextField, string>
  /** Normalized, deduplicated terms that fit the transcription-hint budget. */
  glossary: string[]
  glossaryExcluded: string[]
  resume: MeetingResume | null
  /** Judgement fields the pack supplied. */
  sources: Partial<Record<JudgementField, ValueSource>>
  /** Judgement fields the pack left null or empty: Sanas may draft them at import. */
  missing: JudgementField[]
}

/** `company — role` (or company alone), shortened visibly to the job-name limit. */
export function proposedJobName(
  company: string,
  role: string,
): {
  proposed: string
  shortened: boolean
} {
  const full = role ? `${company} — ${role}` : company
  if (full.length <= JOB_NAME_MAX_CHARS) return { proposed: full, shortened: false }
  return { proposed: `${full.slice(0, JOB_NAME_MAX_CHARS - 1).trimEnd()}…`, shortened: true }
}

/** Collapses whitespace, drops case-insensitive duplicates keeping the first spelling and
 *  order, then keeps what fits the STT keyterm budget; the rest is reported as excluded. */
export function normalizeGlossary(raw: readonly string[]): { terms: string[]; excluded: string[] } {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const value of raw) {
    const term = value.replace(/\s+/g, ' ').trim()
    const key = term.toLowerCase()
    if (!term || seen.has(key)) continue
    seen.add(key)
    unique.push(term)
  }
  const terms = fitKeyterms(unique)
  const kept = new Set(terms)
  return { terms, excluded: unique.filter((t) => !kept.has(t)) }
}

/** A pack resume as a saved job resume: empty text means none; a missing name gets a
 *  deterministic one. */
export function packResume(pack: Pick<ValidPack, 'resume' | 'company'>): MeetingResume | null {
  if (!pack.resume?.text.trim()) return null
  const name = pack.resume.name || `${pack.company} resume`.slice(0, 255)
  return validateResume({ name, text: pack.resume.text })
}

export function mapPack(pack: ValidPack): SourceValues {
  const glossary = normalizeGlossary(pack.glossary ?? [])
  const sources: SourceValues['sources'] = {}
  const missing: JudgementField[] = []
  for (const key of JUDGEMENT_FIELDS) {
    const present = key === 'glossary' ? glossary.terms.length > 0 : !!pack[key]?.trim()
    if (present) sources[key] = 'resumes'
    else missing.push(key)
  }
  return {
    fields: {
      companyInfo: pack.companyInfo ?? '',
      projectScope: pack.projectScope,
      notes: pack.notes,
      talkingPoints: pack.talkingPoints ?? '',
      persona: pack.persona ?? '',
    },
    glossary: glossary.terms,
    glossaryExcluded: glossary.excluded,
    resume: packResume(pack),
    sources,
    missing,
  }
}
