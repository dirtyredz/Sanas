import type { Job, Settings } from '@shared/types'
import { SETTINGS_SCHEMA } from '../config/settings-schema'

// Ingress checks for what the renderer sends over IPC. Preload's TypeScript types do not
// survive the hop, so every handler argument goes through one of these before delegating.
// Readable Errors here become the message the UI shows.

/** A positive safe integer — every row id. */
export function requireId(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) {
    throw new Error(`Invalid ${what}: ${String(v)}`)
  }
  return v
}

/** A diarized speaker index: zero or a positive safe integer. */
export function requireSpeaker(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
    throw new Error(`Invalid ${what}: ${String(v)}`)
  }
  return v
}

export function requireBool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`Invalid ${what}`)
  return v
}

/** Non-empty free text, trimmed, capped so a stray payload cannot be huge. */
export function requireText(v: unknown, what: string, max: number): string {
  if (typeof v !== 'string' || v.trim().length === 0 || v.length > max) {
    throw new Error(`Invalid ${what}`)
  }
  return v.trim()
}

/** Free text that may be empty but must be a string — a field of a full-row update,
 *  where a missing or mistyped value must not silently blank what is stored. */
export function boundedText(v: unknown, what: string, max: number): string {
  if (typeof v !== 'string' || v.length > max) throw new Error(`Invalid ${what}`)
  return v
}

/** Optional free text: a string capped at `max`; anything else becomes empty ("clear"). */
export function optionalText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

/** A list of row ids: at least `min`, each valid, no duplicates. */
export function requireIdList(v: unknown, what: string, min: number): number[] {
  if (!Array.isArray(v) || v.length < min) throw new Error(`Invalid ${what}`)
  const ids = v.map((x) => requireId(x, what))
  if (new Set(ids).size !== ids.length) throw new Error(`Invalid ${what}: repeated`)
  return ids
}

const PACK_MAX = 20_000 // a context-pack field; the whole pack is sent on every suggestion

/** The editable job fields for a full-row update: every field must be present as a
 *  string (empty allowed) so a malformed payload cannot erase stored context; unknown
 *  keys are dropped. */
export function requireJob(v: unknown): Omit<Job, 'createdAt' | 'archived'> {
  if (typeof v !== 'object' || v === null) throw new Error('Invalid job')
  const j = v as Record<string, unknown>
  return {
    id: requireId(j.id, 'job id'),
    name: requireText(j.name, 'job name', 120),
    companyInfo: boundedText(j.companyInfo, 'company info', PACK_MAX),
    projectScope: boundedText(j.projectScope, 'project scope', PACK_MAX),
    notes: boundedText(j.notes, 'notes', PACK_MAX),
    talkingPoints: boundedText(j.talkingPoints, 'talking points', PACK_MAX),
    persona: boundedText(j.persona, 'persona', 2_000),
    summaryEmail: boundedText(j.summaryEmail, 'summary email', 200),
  }
}

/** A settings patch: only keys the schema knows, each accepted by its checker; anything
 *  mistyped or out of range is dropped rather than written to settings.json. */
export function requireSettingsPatch(v: unknown): Partial<Settings> {
  if (typeof v !== 'object' || v === null) throw new Error('Invalid settings')
  const p = v as Record<string, unknown>
  const out: Partial<Settings> = {}
  const take = <K extends keyof Settings>(key: K): void => {
    if (!(key in p)) return
    const value = SETTINGS_SCHEMA[key](p[key])
    if (value !== undefined) out[key] = value
  }
  for (const key of Object.keys(SETTINGS_SCHEMA) as (keyof Settings)[]) take(key)
  return out
}
