import type { MeetingResume } from '../meeting/meeting-resume'
import type { JobTextField, JudgementField, ValueSource } from './applications'

// Storage-independent value contracts for the resumes import's three-way refresh. The SQLite
// repo adapts rows/JSON to these; the merge logic reads them without knowing about storage.

/** Source values as last imported or reviewed: the "base" of the three-way refresh
 *  comparison. Per-field `sources` records which saved values Sanas drafted at import. */
export interface ImportBaseline {
  version: 1
  fields: Record<JobTextField, string>
  glossary: string[]
  resume: MeetingResume | null
  sources: Partial<Record<JudgementField, ValueSource>>
}

/** The saved Sanas values of a job: the "local" side of a refresh. */
export interface LocalValues {
  fields: Record<JobTextField, string>
  glossary: readonly { term: string; note: string }[]
  resume: MeetingResume | null
}
