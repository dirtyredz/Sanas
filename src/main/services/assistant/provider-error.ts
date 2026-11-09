// Neutral failure categories a provider attaches to its transport errors at the seam, so
// failure-diagnostics never has to recognise a vendor's error class names. A provider that
// has no category to add simply throws; the diagnostics then fall back to the HTTP status.

export type ProviderFailureCategory = 'connection' | 'timeout'

const KEY = 'providerCategory'

/** Tags `error` in place (it keeps its identity, message, status and request id) and returns it. */
export function tagProviderError<T>(error: T, category: ProviderFailureCategory | undefined): T {
  if (category && error && typeof error === 'object') {
    try {
      Object.defineProperty(error, KEY, { value: category, configurable: true })
    } catch {
      /* a frozen error just stays untagged */
    }
  }
  return error
}

export function providerFailureCategory(error: unknown): ProviderFailureCategory | undefined {
  if (!error || typeof error !== 'object') return undefined
  const value = (error as Record<string, unknown>)[KEY]
  return value === 'connection' || value === 'timeout' ? value : undefined
}
