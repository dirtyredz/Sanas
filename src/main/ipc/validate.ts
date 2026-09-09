import type { Job, MeetingSource, Settings } from '@shared/types'

// Ingress checks for what the renderer sends over IPC. Preload's TypeScript types do not
// survive the hop, so every handler that takes an argument runs it through one of these
// before delegating. Readable Errors here become the message the UI shows.

/** A positive safe integer — every row id. */
export function requireId(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) {
    throw new Error(`Invalid ${what}: ${String(v)}`)
  }
  return v
}

/** Non-empty free text, trimmed, capped so a stray payload cannot be huge. */
export function requireText(v: unknown, what: string, max: number): string {
  if (typeof v !== 'string' || v.trim().length === 0 || v.length > max) {
    throw new Error(`Invalid ${what}`)
  }
  return v.trim()
}

/** Optional free text: a string capped at `max`; anything else becomes empty ("clear"). */
export function optionalText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

const PACK_MAX = 20_000 // a context-pack field; the whole pack is sent on every suggestion

/** The editable job fields, each string capped; id validated. Unknown keys are dropped. */
export function requireJob(v: unknown): Omit<Job, 'createdAt' | 'archived'> {
  if (typeof v !== 'object' || v === null) throw new Error('Invalid job')
  const j = v as Record<string, unknown>
  return {
    id: requireId(j.id, 'job id'),
    name: requireText(j.name, 'job name', 120),
    companyInfo: optionalText(j.companyInfo, PACK_MAX),
    projectScope: optionalText(j.projectScope, PACK_MAX),
    notes: optionalText(j.notes, PACK_MAX),
    talkingPoints: optionalText(j.talkingPoints, PACK_MAX),
    persona: optionalText(j.persona, 2_000),
    summaryEmail: optionalText(j.summaryEmail, 200),
  }
}

function num(v: unknown, min: number, max: number, integer: boolean): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return undefined
  return integer && !Number.isInteger(v) ? undefined : v
}

const SOURCES: MeetingSource[] = ['this-pc', 'elsewhere']

/** A settings patch: only known keys, each with the right type and range; anything else
 *  is dropped rather than written to settings.json. */
export function requireSettingsPatch(v: unknown): Partial<Settings> {
  if (typeof v !== 'object' || v === null) throw new Error('Invalid settings')
  const p = v as Record<string, unknown>
  const out: Partial<Settings> = {}
  const text = (key: keyof Settings, max: number): void => {
    if (typeof p[key] === 'string')
      (out as Record<string, unknown>)[key] = (p[key] as string).slice(0, max)
  }
  const bool = (key: keyof Settings): void => {
    if (typeof p[key] === 'boolean') (out as Record<string, unknown>)[key] = p[key]
  }
  text('deepgramApiKey', 500)
  text('anthropicApiKey', 500)
  text('anthropicWorkspaceId', 200)
  text('overlayHotkey', 60)
  text('assistHotkey', 60)
  text('audioDeviceId', 300)
  text('smtpHost', 253)
  text('smtpUser', 320)
  text('smtpPass', 500)
  bool('recordAudio')
  bool('summaryEmailAuto')
  const port = num(p.smtpPort, 1, 65_535, true)
  if (port !== undefined) out.smtpPort = port
  const opacity = num(p.overlayOpacity, 0.4, 1, false)
  if (opacity !== undefined) out.overlayOpacity = opacity
  const audioDays = num(p.audioRetentionDays, 0, 3_650, true)
  if (audioDays !== undefined) out.audioRetentionDays = audioDays
  const meetingDays = num(p.meetingRetentionDays, 0, 3_650, true)
  if (meetingDays !== undefined) out.meetingRetentionDays = meetingDays
  if (SOURCES.includes(p.meetingSource as MeetingSource))
    out.meetingSource = p.meetingSource as MeetingSource
  if (p.overlayBounds === null) out.overlayBounds = null
  else if (typeof p.overlayBounds === 'object' && p.overlayBounds !== null) {
    const b = p.overlayBounds as Record<string, unknown>
    const x = num(b.x, -100_000, 100_000, true)
    const y = num(b.y, -100_000, 100_000, true)
    const width = num(b.width, 100, 10_000, true)
    const height = num(b.height, 100, 10_000, true)
    if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) {
      out.overlayBounds = { x, y, width, height }
    }
  }
  return out
}
