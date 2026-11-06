import {
  JOB_TEXT_FIELDS,
  JUDGEMENT_FIELDS,
  type ApplyRequest,
  type ConflictChoice,
  type ImportFieldKey,
} from '@shared/jobs/applications'
import { JOB_CONTEXT_MAX_CHARS, JOB_NAME_MAX_CHARS } from '@shared/jobs/limits'
import { isPreviewToken } from '../../services/jobs/preview-tokens'
import { isSafeApplicationId } from '../../services/jobs/applications/source/validate-pack'
import { isMainWindowSender } from '../../windows/main-window'

// Ingress checks for job deletion and application import. The renderer names only a listed
// application ID, an opaque token and its choices; anything else (a pack, a path, extra keys)
// is refused rather than ignored.

/** Privileged job operations answer only the library window. */
export function requireLibrarySender(event: { sender: { id: number } }): number {
  if (!isMainWindowSender(event.sender.id)) throw new Error('Not allowed from this window.')
  return event.sender.id
}

export function requireApplicationId(v: unknown): string {
  if (!isSafeApplicationId(v)) throw new Error('Invalid application ID.')
  return v
}

export function requireToken(v: unknown): string {
  if (!isPreviewToken(v)) throw new Error('Invalid confirmation.')
  return v
}

/** `jobs.list` options: omitted, or `{ includeArchived: boolean }`. */
export function requireListOptions(v: unknown): { includeArchived: boolean } {
  if (v === undefined || v === null) return { includeArchived: false }
  if (typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid job list options.')
  const o = v as Record<string, unknown>
  for (const key of Object.keys(o))
    if (key !== 'includeArchived') throw new Error(`Unsupported job list option: ${key}.`)
  if (o.includeArchived !== undefined && typeof o.includeArchived !== 'boolean')
    throw new Error('Invalid job list options.')
  return { includeArchived: o.includeArchived === true }
}

const APPLY_KEYS = new Set(['token', 'name', 'edits', 'choices', 'archive'])
/** Only judgement fields can be drafted, so only they can be edited in a create preview. */
const EDITABLE = new Set<string>(JUDGEMENT_FIELDS)
const CHOICE_KEYS = new Set<string>([...JOB_TEXT_FIELDS, 'glossary', 'resume'])
const CHOICES: readonly ConflictChoice[] = ['keep', 'incoming']

function plainObject(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`Invalid ${what}.`)
  return v as Record<string, unknown>
}

export function requireApplyRequest(v: unknown): ApplyRequest {
  const r = plainObject(v, 'import request')
  for (const key of Object.keys(r))
    if (!APPLY_KEYS.has(key)) throw new Error(`Unsupported import option: ${key}.`)
  const out: ApplyRequest = { token: requireToken(r.token) }
  if (r.name !== undefined) {
    if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > JOB_NAME_MAX_CHARS)
      throw new Error(`Give the job a name of 1–${JOB_NAME_MAX_CHARS} characters.`)
    out.name = r.name
  }
  if (r.edits !== undefined) {
    const edits = plainObject(r.edits, 'edits')
    out.edits = {}
    for (const [key, value] of Object.entries(edits)) {
      if (!EDITABLE.has(key)) throw new Error(`Field ${key} cannot be edited here.`)
      if (typeof value !== 'string' || value.length > JOB_CONTEXT_MAX_CHARS)
        throw new Error(`Invalid ${key}.`)
      out.edits[key as keyof NonNullable<ApplyRequest['edits']>] = value
    }
  }
  if (r.choices !== undefined) {
    const choices = plainObject(r.choices, 'choices')
    out.choices = {}
    for (const [key, value] of Object.entries(choices)) {
      if (!CHOICE_KEYS.has(key) || !CHOICES.includes(value as ConflictChoice))
        throw new Error('Invalid conflict choice.')
      out.choices[key as ImportFieldKey] = value as ConflictChoice
    }
  }
  if (r.archive !== undefined) {
    if (typeof r.archive !== 'boolean') throw new Error('Invalid archive choice.')
    out.archive = r.archive
  }
  return out
}
