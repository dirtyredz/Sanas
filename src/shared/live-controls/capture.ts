import type { ManualKind } from './types'

// Screen-capture contracts shared by main, preload and the overlay. Image bytes never cross
// this boundary: the renderer only ever sees a bounded thumbnail of a main-owned draft and
// refers back to it through a main-issued token.

/** A composer attachment as the overlay sees it. `thumbnail` is a bounded PNG/JPEG data URL. */
export interface CaptureDraftView {
  meetingId: number
  token: string
  thumbnail: string
  /** Which screen was captured, so a wrong-monitor capture is recognisable. */
  display: string
  width: number
  height: number
}

export type CaptureAttachResult =
  { ok: true; draft: CaptureDraftView } | { ok: false; message: string }

/** Feedback for a direct capture, broadcast to the overlay (also fetched once on mount so a
 *  first-use hotkey that created the overlay cannot lose it). */
export interface CaptureStatus {
  meetingId: number | null
  phase: 'idle' | 'capturing' | 'analyzing' | 'failed'
  message: string
  /** Increases on every change, so a late reply cannot overwrite a newer status. */
  seq: number
}

// Persistence without a schema change (owner scope cut, docs/plans/screen-capture.md §8):
// the suggestions CHECK constraint only allows 'typed' | 'detail' | 'audience', so a capture
// answer is stored as 'typed' and its request text carries a fixed marker. Only the
// repositories call these two functions.

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
