import type { Job, OverlayResizeRequest, Settings } from '@shared/types'
import { SETTINGS_SCHEMA } from '../config/settings-schema'
import { MEETING_CONTEXT_MAX_CHARS } from '@shared/meeting-context'
import type { MeetingStartOptions } from '@shared/meeting-start'
import {
  JOB_CONTEXT_MAX_CHARS,
  JOB_NAME_MAX_CHARS,
  JOB_PERSONA_MAX_CHARS,
  JOB_SUMMARY_EMAIL_MAX_CHARS,
} from '@shared/jobs/limits'

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

/** One or both overlay dimensions. Main clamps valid requests to the display work area. */
export function requireOverlayResize(v: unknown): OverlayResizeRequest {
  if (typeof v !== 'object' || v === null) throw new Error('Invalid overlay resize')
  const request = v as Record<string, unknown>
  const out: OverlayResizeRequest = {}
  const dimension = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
      throw new Error('Invalid overlay resize')
    }
    return value
  }
  if ('width' in request) out.width = dimension(request.width)
  if ('height' in request) out.height = dimension(request.height)
  if (out.width === undefined && out.height === undefined) throw new Error('Invalid overlay resize')
  return out
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

/** The editable job fields for a full-row update: every field must be present as a
 *  string (empty allowed) so a malformed payload cannot erase stored context; unknown
 *  keys are dropped. */
export function requireJob(v: unknown): Omit<Job, 'createdAt' | 'archived'> {
  if (typeof v !== 'object' || v === null) throw new Error('Invalid job')
  const j = v as Record<string, unknown>
  return {
    id: requireId(j.id, 'job id'),
    name: requireText(j.name, 'job name', JOB_NAME_MAX_CHARS),
    companyInfo: boundedText(j.companyInfo, 'company info', JOB_CONTEXT_MAX_CHARS),
    projectScope: boundedText(j.projectScope, 'project scope', JOB_CONTEXT_MAX_CHARS),
    notes: boundedText(j.notes, 'notes', JOB_CONTEXT_MAX_CHARS),
    talkingPoints: boundedText(j.talkingPoints, 'talking points', JOB_CONTEXT_MAX_CHARS),
    persona: boundedText(j.persona, 'persona', JOB_PERSONA_MAX_CHARS),
    summaryEmail: boundedText(j.summaryEmail, 'summary email', JOB_SUMMARY_EMAIL_MAX_CHARS),
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

const START_KEYS = new Set(['interview', 'meetingContext'])

/** The Live page's Start options. Omitted means defaults. Unknown keys (including the retired
 *  `usePresentationDeck`) are refused, never ignored, and context is never truncated. */
export function requireMeetingStart(raw: unknown): MeetingStartOptions {
  if (raw === undefined || raw === null) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid start options.')
  const r = raw as Record<string, unknown>
  for (const key of Object.keys(r))
    if (!START_KEYS.has(key)) throw new Error(`Unsupported start option: ${key}.`)
  const out: MeetingStartOptions = {}
  if (r.interview !== undefined) {
    if (typeof r.interview !== 'boolean') throw new Error('Invalid interview choice.')
    out.interview = r.interview
  }
  if (r.meetingContext !== undefined) {
    if (typeof r.meetingContext !== 'string') throw new Error('Meeting context must be text.')
    if (r.meetingContext.length > MEETING_CONTEXT_MAX_CHARS)
      throw new Error(
        `Meeting context must be at most ${MEETING_CONTEXT_MAX_CHARS.toLocaleString('en-US')} characters.`,
      )
    out.meetingContext = r.meetingContext
  }
  return out
}
