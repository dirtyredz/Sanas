import type { ManualKind } from '@shared/live-controls/types'

// Persistence without a schema change (owner scope cut, docs/plans/screen-capture.md §8):
// the suggestions CHECK constraint only allows 'typed' | 'detail' | 'audience', so a capture
// answer is stored as 'typed' and its request text carries a fixed marker. Only the
// repositories use these two functions.

export const CAPTURE_REQUEST_MARKER = '[Screen capture]'

/** What a capture answer's kind and request text look like on disk. */
export function storedManualKind(
  manualKind: ManualKind | null | undefined,
  requestText: string | null | undefined,
): { manualKind: Exclude<ManualKind, 'capture'> | null; requestText: string | null } {
  if (manualKind !== 'capture')
    return { manualKind: manualKind ?? null, requestText: requestText ?? null }
  const text = requestText?.trim()
  return {
    manualKind: 'typed',
    requestText: text ? `${CAPTURE_REQUEST_MARKER} ${text}` : CAPTURE_REQUEST_MARKER,
  }
}

/** The inverse of `storedManualKind` for a row read back from the database. */
export function readManualKind(
  manualKind: ManualKind | null | undefined,
  requestText: string | null | undefined,
): { manualKind: ManualKind | null; requestText: string | null } {
  if (manualKind === 'typed' && requestText?.startsWith(CAPTURE_REQUEST_MARKER)) {
    const rest = requestText.slice(CAPTURE_REQUEST_MARKER.length).trim()
    return { manualKind: 'capture', requestText: rest || null }
  }
  return { manualKind: manualKind ?? null, requestText: requestText ?? null }
}
