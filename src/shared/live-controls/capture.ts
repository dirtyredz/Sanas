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
