import type { ProviderUsage } from './types'

// Provider-neutral usage reporting: best effort, so evidence never fails generation. Each
// provider extracts its own counts (claude-usage.ts for Anthropic).

/** Calls the observer; its failure is swallowed so evidence never fails generation. */
export function reportUsage(
  observer: ((usage: ProviderUsage) => void) | undefined,
  usage: ProviderUsage | null,
): void {
  if (!observer || !usage) return
  try {
    observer(usage)
  } catch {
    /* evidence is best effort */
  }
}
