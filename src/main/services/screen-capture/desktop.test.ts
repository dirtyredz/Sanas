import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ desktopCapturer: {}, screen: {} }))

import {
  captureDisplay,
  displayLabel,
  targetDisplay,
  type CaptureDisplay,
  type CaptureSource,
  type DesktopDeps,
} from './desktop'
import type { EncodableImage } from './encode'

const image = (empty = false): EncodableImage => ({
  getSize: () => ({ width: 10, height: 10 }),
  isEmpty: () => empty,
  resize() {
    return this
  },
  toPNG: () => Buffer.alloc(1),
  toJPEG: () => Buffer.alloc(1),
})

// a 150% primary at the origin and a 100% portrait monitor to its LEFT (negative origin)
const primary: CaptureDisplay = {
  id: 101,
  bounds: { x: 0, y: 0, width: 1707, height: 960 },
  size: { width: 1707, height: 960 },
  scaleFactor: 1.5,
  label: 'Laptop',
}
const left: CaptureDisplay = {
  id: 202,
  bounds: { x: -1080, y: -400, width: 1080, height: 1920 },
  size: { width: 1080, height: 1920 },
  scaleFactor: 1,
  label: 'DELL P2419H',
}

function deps(over: Partial<DesktopDeps> = {}): DesktopDeps & { requested: unknown[] } {
  const requested: unknown[] = []
  const sources: CaptureSource[] = [
    // deliberately listed in the "wrong" order: identity is the display id, not position
    { display_id: '202', thumbnail: image() },
    { display_id: '101', thumbnail: image() },
  ]
  return {
    requested,
    overlayBounds: () => null,
    cursorPoint: () => ({ x: 10, y: 10 }),
    displayMatching: (b) => (b.x < 0 ? left : primary),
    displayNearestPoint: (p) => (p.x < 0 ? left : primary),
    allDisplays: () => [primary, left],
    getSources: async (options) => {
      requested.push(options)
      return sources
    },
    ...over,
  }
}

describe('display selection', () => {
  it('uses the overlay display even when the overlay sits at negative coordinates', () => {
    const d = deps({ overlayBounds: () => ({ x: -900, y: -200, width: 380, height: 460 }) })
    expect(targetDisplay(d).id).toBe(202)
  })

  it('falls back to the cursor display when there is no overlay window yet', () => {
    expect(targetDisplay(deps({ cursorPoint: () => ({ x: -5, y: 5 }) })).id).toBe(202)
    expect(targetDisplay(deps()).id).toBe(101)
  })

  it('labels the display in physical pixels', () => {
    expect(displayLabel(primary)).toBe('Laptop (2561×1440)')
    expect(displayLabel({ ...left, label: '' })).toBe('Screen (1080×1920)')
  })
})

describe('captureDisplay', () => {
  afterEach(() => vi.useRealTimers())

  it('matches the source by display id and asks for a bounded pixel size', async () => {
    const d = deps()
    const result = await captureDisplay(d, primary)
    expect(result.display).toContain('Laptop')
    const { thumbnailSize } = d.requested[0] as { thumbnailSize: { width: number; height: number } }
    expect(Math.max(thumbnailSize.width, thumbnailSize.height)).toBeLessThanOrEqual(1568)
    expect(thumbnailSize.width / thumbnailSize.height).toBeCloseTo(1707 / 960, 1)
  })

  it('keeps portrait displays portrait', async () => {
    const d = deps()
    await captureDisplay(d, left)
    const { thumbnailSize } = d.requested[0] as { thumbnailSize: { width: number; height: number } }
    expect(thumbnailSize.height).toBeGreaterThan(thumbnailSize.width)
  })

  it('refuses a display that disappeared instead of capturing another one', async () => {
    await expect(captureDisplay(deps({ allDisplays: () => [primary] }), left)).rejects.toThrow(
      'no longer connected',
    )
  })

  it('refuses when no source matches the display', async () => {
    await expect(
      captureDisplay(
        deps({ getSources: async () => [{ display_id: '999', thumbnail: image() }] }),
        primary,
      ),
    ).rejects.toThrow("Couldn't find")
  })

  it('reports an empty capture readably', async () => {
    await expect(
      captureDisplay(
        deps({ getSources: async () => [{ display_id: '101', thumbnail: image(true) }] }),
        primary,
      ),
    ).rejects.toThrow('empty capture')
  })

  it('gives up after the deadline and ignores the late result', async () => {
    vi.useFakeTimers()
    let resolve: (s: CaptureSource[]) => void = () => undefined
    const late = new Promise<CaptureSource[]>((r) => (resolve = r))
    const pending = captureDisplay(deps({ getSources: () => late }), primary, 5000)
    const assertion = expect(pending).rejects.toThrow('took too long')
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
    resolve([{ display_id: '101', thumbnail: image() }]) // arrives late: nothing happens
  })
})
