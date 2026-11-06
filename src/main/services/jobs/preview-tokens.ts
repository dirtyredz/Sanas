import { randomUUID } from 'node:crypto'

// Main-owned confirmation tokens for previews the user must confirm (job deletion,
// application import). A token is opaque to the renderer, bound to the window that asked,
// single-use and short-lived; what it stands for stays in main.

export const PREVIEW_TOKEN_TTL_MS = 10 * 60_000
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** True for the shape `issue` hands out, so ingress can refuse anything else cheaply. */
export function isPreviewToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN.test(value)
}

export interface PreviewTokens<T> {
  issue(senderId: number, payload: T): string
  /** The payload for this sender, consumed; null when unknown, expired or another sender's. */
  take(token: string, senderId: number): T | null
  clear(): void
}

export function createPreviewTokens<T>(
  ttlMs = PREVIEW_TOKEN_TTL_MS,
  now: () => number = () => Date.now(),
): PreviewTokens<T> {
  const entries = new Map<string, { senderId: number; payload: T; expires: number }>()
  const prune = (): void => {
    const t = now()
    for (const [token, entry] of entries) if (entry.expires <= t) entries.delete(token)
  }
  return {
    issue(senderId, payload) {
      prune()
      const token = randomUUID()
      entries.set(token, { senderId, payload, expires: now() + ttlMs })
      return token
    },
    take(token, senderId) {
      prune()
      const entry = entries.get(token)
      if (!entry || entry.senderId !== senderId) return null
      entries.delete(token)
      return entry.payload
    },
    clear() {
      entries.clear()
    },
  }
}
