import type { MeetingSource, Settings } from '@shared/types'

// One runtime check per Settings key, exhaustive by construction: adding a key to the
// Settings type fails to compile until it has a checker here, so a new setting can never
// be one the renderer is silently unable to save. A checker returns the accepted value,
// or undefined to drop a mistyped / out-of-range value rather than write it.

export type Check<T> = (v: unknown) => T | undefined

const text =
  (max: number): Check<string> =>
  (v) =>
    typeof v === 'string' ? v.slice(0, max) : undefined

const bool: Check<boolean> = (v) => (typeof v === 'boolean' ? v : undefined)

const num =
  (min: number, max: number, integer: boolean): Check<number> =>
  (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return undefined
    return integer && !Number.isInteger(v) ? undefined : v
  }

const SOURCES: readonly MeetingSource[] = ['this-pc', 'elsewhere']
const source: Check<MeetingSource> = (v) =>
  SOURCES.includes(v as MeetingSource) ? (v as MeetingSource) : undefined

const bounds: Check<Settings['overlayBounds']> = (v) => {
  if (v === null) return null
  if (typeof v !== 'object' || v === null) return undefined
  const b = v as Record<string, unknown>
  const x = num(-100_000, 100_000, true)(b.x)
  const y = num(-100_000, 100_000, true)(b.y)
  const width = num(100, 10_000, true)(b.width)
  const height = num(100, 10_000, true)(b.height)
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined
  }
  return { x, y, width, height }
}

export const SETTINGS_SCHEMA: { [K in keyof Settings]: Check<Settings[K]> } = {
  deepgramApiKey: text(500),
  anthropicApiKey: text(500),
  anthropicWorkspaceId: text(200),
  overlayHotkey: text(60),
  assistHotkey: text(60),
  audioDeviceId: text(300),
  recordAudio: bool,
  meetingSource: source,
  overlayOpacity: num(0.4, 1, false),
  overlayBounds: bounds,
  summaryEmailAuto: bool,
  smtpHost: text(253),
  smtpPort: num(1, 65_535, true),
  smtpUser: text(320),
  smtpPass: text(500),
  audioRetentionDays: num(0, 3_650, true),
  meetingRetentionDays: num(0, 3_650, true),
}
