/** Pure placement rules for the overlay window (DIP coordinates; negative values are valid for
 *  monitors left of / above the primary). No Electron imports so it is unit-testable. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export const DEFAULT_OVERLAY_SIZE = { width: 380, height: 460 }
const MARGIN = 20
const DEFAULT_TOP = 60
/** The draggable header: the top strip of the window that must stay reachable. */
const HEADER_HEIGHT = 40
const MIN_VISIBLE_WIDTH = 100
const MIN_VISIBLE_HEIGHT = 24

function overlap(a: Rect, b: Rect): { width: number; height: number } {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return { width: Math.max(0, width), height: Math.max(0, height) }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), Math.max(lo, hi))
}

/**
 * Returns bounds that are safe to show given the connected displays' work areas.
 * - No saved bounds: default spot at the primary display's top right.
 * - Header strip reachable on some display: position kept (a partly off-screen overlay the user
 *   parked is honored); only an oversized window is shrunk and nudged inside that display.
 * - Otherwise (monitor gone): same size (clamped to fit), default spot on the primary display.
 */
export function fitOverlayBounds(
  saved: Rect | null | undefined,
  workAreas: Rect[],
  primary: Rect,
  minSize: { width: number; height: number },
): Rect {
  const size = saved ?? { ...DEFAULT_OVERLAY_SIZE }
  const fitSize = (wa: Rect): { width: number; height: number } => ({
    width: clamp(size.width, Math.min(minSize.width, wa.width), wa.width),
    height: clamp(size.height, Math.min(minSize.height, wa.height), wa.height),
  })
  const place = (wa: Rect): Rect => {
    const { width, height } = fitSize(wa)
    return {
      width,
      height,
      x: clamp(wa.x + wa.width - width - MARGIN, wa.x, wa.x + wa.width - width),
      y: clamp(wa.y + DEFAULT_TOP, wa.y, wa.y + wa.height - height),
    }
  }
  if (!saved || ![saved.x, saved.y, saved.width, saved.height].every(Number.isFinite)) {
    return place(primary)
  }

  const header: Rect = { ...saved, height: Math.min(HEADER_HEIGHT, saved.height) }
  let best: Rect | null = null
  let bestArea = 0
  for (const wa of workAreas) {
    const o = overlap(header, wa)
    if (o.width >= Math.min(MIN_VISIBLE_WIDTH, header.width) && o.height >= MIN_VISIBLE_HEIGHT) {
      const area = o.width * o.height
      if (area > bestArea) {
        best = wa
        bestArea = area
      }
    }
  }
  if (!best) return place(primary)

  const { width, height } = fitSize(best)
  if (width === saved.width && height === saved.height) return { ...saved }
  return {
    width,
    height,
    x: clamp(saved.x, best.x, best.x + best.width - width),
    y: clamp(saved.y, best.y, best.y + best.height - height),
  }
}
