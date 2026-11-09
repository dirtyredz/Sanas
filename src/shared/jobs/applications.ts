// Renderer-safe contracts for creating and refreshing jobs from the resumes project's
// interview packs. Main lists, previews and applies; the renderer only ever names a listed
// application ID, an opaque preview token and its choices. It never sends a pack, a path or
// command arguments.

import type { MeetingResume } from '../meeting-resume'

export const APPLICATION_STAGES = ['interview', 'offer', 'closed'] as const
export type ApplicationStage = (typeof APPLICATION_STAGES)[number]

/** The job's free-text context fields a pack can fill. */
export const JOB_TEXT_FIELDS = [
  'companyInfo',
  'projectScope',
  'notes',
  'talkingPoints',
  'persona',
] as const
export type JobTextField = (typeof JOB_TEXT_FIELDS)[number]

/** Pack fields that are judgement, not fact: the producer may leave them null, and Sanas then
 *  drafts them at import from the verified notes. */
export const JUDGEMENT_FIELDS = ['companyInfo', 'talkingPoints', 'persona', 'glossary'] as const
export type JudgementField = (typeof JUDGEMENT_FIELDS)[number]

/** Narrows any field key to a judgement field. */
export const isJudgementField = (key: string): key is JudgementField =>
  (JUDGEMENT_FIELDS as readonly string[]).includes(key)

/** Every reviewable unit of an import: text fields, the glossary collection and the resume. */
export type ImportFieldKey = JobTextField | 'glossary' | 'resume'

/** Where a proposed value came from: the resumes pack, or a Sanas draft at import. */
export type ValueSource = 'resumes' | 'drafted'

export type ApplicationRowStatus =
  /** Not imported; interview/offer: can be previewed and created. */
  | 'new'
  /** Linked and nothing new to review. */
  | 'imported'
  /** Linked and the pack (content or stage) changed since the last import or review. */
  | 'refresh-available'
  /** Linked, closed, and the job is still active. */
  | 'archive-available'
  /** Linked to a job imported from a different resumes folder. */
  | 'source-mismatch'
  /** The pack failed validation; `error` says why. */
  | 'invalid'

export interface ApplicationSummary {
  /** The application ID (the file name stem for an invalid pack). */
  applicationId: string
  company: string
  role: string
  stage: ApplicationStage | null
  /** ISO time from the pack, or null when it gave none (shown as Unknown). */
  updatedAt: string | null
  status: ApplicationRowStatus
  jobId: number | null
  jobName: string | null
  archived: boolean
  /** Bounded, readable reason for an invalid or unreadable pack. */
  error: string | null
  /** True when re-reading may succeed (the file changed or vanished while being read). */
  retryable: boolean
}

export interface ApplicationListing {
  /** The configured resumes folder the packs were read from. */
  sourceRoot: string
  /** The pack command's outcome; packs already on disk are listed either way. */
  refresh: { ok: true } | { ok: false; message: string }
  /** 'missing' is an empty state; 'unreadable' is an error. 'invalid-settings' lists nothing. */
  folder: 'ok' | 'missing' | 'unreadable' | 'invalid-settings'
  folderError: string | null
  packs: ApplicationSummary[]
  /** The enumeration bound was reached; some packs are not shown. */
  limited: boolean
}

export type FieldOutcome =
  /** Create: a value for a new job. */
  | 'new'
  /** Nothing differs from what is saved. */
  | 'unchanged'
  /** Only the application changed: its value is proposed. */
  | 'incoming'
  /** Only Sanas changed: the local value is kept. */
  | 'keep-local'
  /** Both changed differently: choose; Keep Sanas is the default. */
  | 'conflict'

/** A typed value the preview compares. Main never formats it: labels and display text are
 *  the renderer's job. Glossary terms carry their saved note (empty for pack terms). */
export type PreviewValue =
  | { kind: 'text'; text: string }
  | { kind: 'glossary'; terms: { term: string; note: string }[] }
  | { kind: 'resume'; resume: MeetingResume | null }

export interface PreviewField {
  key: ImportFieldKey
  outcome: FieldOutcome
  /** Saved Sanas value (refresh only). */
  local: PreviewValue | null
  /** The application's value (a draft when `source` is 'drafted'). */
  incoming: PreviewValue
  source: ValueSource | null
  /** Drafted fields can be edited in the preview before the job is created. */
  editable: boolean
  /** Why a draft is empty (the provider failed or returned nothing usable). */
  draftError: string | null
}

export interface ApplicationPreview {
  token: string
  mode: 'create' | 'refresh'
  applicationId: string
  jobId: number | null
  company: string
  role: string
  stage: ApplicationStage
  jdUrl: string
  updatedAt: string | null
  /** Create only: the proposed job name; `shortened` requires explicit acceptance. */
  name: { proposed: string; shortened: boolean } | null
  fields: PreviewField[]
  /** Glossary terms left out by the transcription-hint budget. */
  glossaryExcluded: string[]
  /** What validation normalized (line endings, control characters, unsafe link). */
  normalized: string[]
  stageChange: { from: ApplicationStage; to: ApplicationStage } | null
  /** Linked job whose application is closed and which is still active. */
  offerArchive: boolean
  archived: boolean
  /** Refresh: true when applying would change anything (values or stage review). */
  hasChanges: boolean
  /** A readable notice when Sanas could not draft every empty judgement field. */
  draftNotice: string | null
}

export type ConflictChoice = 'keep' | 'incoming'

export interface ApplyRequest {
  token: string
  /** Create: the job name (edited or accepted). */
  name?: string
  /** Create: the user's edits to drafted fields (glossary is one term per line). */
  edits?: Partial<Record<JobTextField | 'glossary', string>>
  /** Refresh: a choice per conflicting field; missing means Keep Sanas. */
  choices?: Partial<Record<ImportFieldKey, ConflictChoice>>
  /** Refresh of a closed application: archive the linked job. */
  archive?: boolean
}

export type ApplyResult =
  | { status: 'created'; jobId: number }
  | { status: 'updated'; jobId: number; archived: boolean }
  | { status: 'stale'; message: string }

export const STALE_PREVIEW_MESSAGE = 'Changed since preview—review again.'
export const REFRESH_FAILED_TITLE = 'Couldn’t refresh from resumes'
