import type { ProviderUsage } from '../types'

// The Anthropic half of provider usage evidence (claude.ts): counts only, extracted
// defensively from whatever the SDK hands back. Field names avoid the word "token" on
// purpose: the main log redacts any key containing it (lifecycle/main-log.ts), which would
// hide the numbers. The provider-neutral reporting lives in provider-evidence.ts.

const count = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined

/** Anthropic `Usage` (or a partial snapshot of it) → ProviderUsage. Null when nothing usable. */
export function usageFromAnthropic(raw: unknown, partial: boolean): ProviderUsage | null {
  if (typeof raw !== 'object' || raw === null) return null
  const u = raw as Record<string, unknown>
  const usage: ProviderUsage = { partial }
  const input = count(u.input_tokens)
  const output = count(u.output_tokens)
  const cacheRead = count(u.cache_read_input_tokens)
  const cacheWrite = count(u.cache_creation_input_tokens)
  if (input !== undefined) usage.inputCount = input
  if (output !== undefined) usage.outputCount = output
  if (cacheRead !== undefined) usage.cacheReadCount = cacheRead
  if (cacheWrite !== undefined) usage.cacheWriteCount = cacheWrite
  return Object.keys(usage).length > 1 ? usage : null
}
