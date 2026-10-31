import { desktopCapturer, screen, type NativeImage, type Point, type Rectangle } from 'electron'
import { MAX_AREA, MAX_EDGE, fitSize, type EncodableImage } from './encode'

// One-shot acquisition of the display under the overlay. No meeting or provider policy here.
//
// Identity is the display ID: the overlay's bounds (DIP, may be negative on a monitor left of
// or above the primary) pick a display through the screen API, and that display's ID is
// matched to `DesktopCapturerSource.display_id`. Source order and screen names are never used
// as identity. A display that disappeared, or that has no matching source, is an error to
// retry rather than a silent capture of some other monitor.

export interface CaptureDisplay {
  id: number
  bounds: Rectangle
  size: { width: number; height: number }
  scaleFactor: number
  label?: string
}

export interface CaptureSource<I extends EncodableImage = EncodableImage> {
  display_id: string
  thumbnail: I
}

export interface DesktopDeps<I extends EncodableImage = EncodableImage> {
  /** The overlay's bounds even when hidden; null when there is no overlay window. */
  overlayBounds(): Rectangle | null
  cursorPoint(): Point
  displayMatching(bounds: Rectangle): CaptureDisplay
  displayNearestPoint(point: Point): CaptureDisplay
  allDisplays(): CaptureDisplay[]
  getSources(options: {
    types: ['screen']
    thumbnailSize: { width: number; height: number }
  }): Promise<CaptureSource<I>[]>
}

/** Acquisition deadline; a later result is discarded. */
export const CAPTURE_TIMEOUT_MS = 5000

/** The display to capture: the one under the overlay, else the one under the cursor. Called
 *  synchronously, before the overlay is revealed, so a first-use hotkey picks the cursor's. */
export function targetDisplay(deps: DesktopDeps): CaptureDisplay {
  const bounds = deps.overlayBounds()
  return bounds ? deps.displayMatching(bounds) : deps.displayNearestPoint(deps.cursorPoint())
}

/** The owner-facing name of a display, so a wrong-monitor capture is recognisable. */
export function displayLabel(display: CaptureDisplay): string {
  const width = Math.round(display.size.width * display.scaleFactor)
  const height = Math.round(display.size.height * display.scaleFactor)
  return `${display.label?.trim() || 'Screen'} (${width}×${height})`
}

export interface AcquiredScreen<I extends EncodableImage = EncodableImage> {
  image: I
  display: string
}

/** Captures one display as an image already bounded to the assistant's pixel limits (the
 *  requested size is only a hint: the caller still validates the actual image). */
export async function captureDisplay<I extends EncodableImage>(
  deps: DesktopDeps<I>,
  display: CaptureDisplay,
  timeoutMs = CAPTURE_TIMEOUT_MS,
): Promise<AcquiredScreen<I>> {
  if (!deps.allDisplays().some((d) => d.id === display.id))
    throw new Error('That screen is no longer connected — move the overlay and try again.')
  const pixels = {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor),
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Capturing the screen took too long — try again.')),
      timeoutMs,
    )
  })
  try {
    const sources = await Promise.race([
      deps.getSources({ types: ['screen'], thumbnailSize: fitSize(pixels, MAX_EDGE, MAX_AREA) }),
      deadline,
    ])
    const source = sources.find((s) => s.display_id === String(display.id))
    if (!source) throw new Error("Couldn't find the overlay's screen to capture — try again.")
    if (source.thumbnail.isEmpty())
      throw new Error(
        'Windows returned an empty capture (the screen may be locked or protected) — try again.',
      )
    return { image: source.thumbnail, display: displayLabel(display) }
  } finally {
    clearTimeout(timer)
  }
}

/** The Electron implementation, bound at the composition root with the overlay's bounds. */
export function electronDesktop(overlayBounds: () => Rectangle | null): DesktopDeps<NativeImage> {
  return {
    overlayBounds,
    cursorPoint: () => screen.getCursorScreenPoint(),
    displayMatching: (bounds) => screen.getDisplayMatching(bounds),
    displayNearestPoint: (point) => screen.getDisplayNearestPoint(point),
    allDisplays: () => screen.getAllDisplays(),
    getSources: (options) => desktopCapturer.getSources(options),
  }
}
