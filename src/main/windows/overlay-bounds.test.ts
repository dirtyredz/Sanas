import { expect, it } from 'vitest'
import { fitOverlayBounds } from './overlay-bounds'

const primary = { x: 0, y: 0, width: 1536, height: 864 }
const min = { width: 280, height: 230 }
const fit = (saved: Parameters<typeof fitOverlayBounds>[0], areas = [primary]) =>
  fitOverlayBounds(saved, areas, primary, min)

it('moves bounds from a disconnected monitor onto the primary display (owner case)', () => {
  const r = fit({ x: 1610, y: -1402, width: 917, height: 1070 })
  expect(r.width).toBe(917)
  expect(r.height).toBe(864)
  expect(r.x).toBeGreaterThanOrEqual(0)
  expect(r.x + r.width).toBeLessThanOrEqual(1536)
  expect(r.y).toBe(0)
})

it('defaults to the primary top-right when nothing is saved', () => {
  expect(fit(null)).toEqual({ x: 1136, y: 60, width: 380, height: 460 })
})

it('keeps negative coordinates when that monitor is connected', () => {
  const left = { x: -1920, y: -200, width: 1920, height: 1080 }
  const saved = { x: -1500, y: -100, width: 400, height: 500 }
  expect(fit(saved, [left, primary])).toEqual(saved)
})

it('clamps an oversized window to the work area of its display', () => {
  const r = fit({ x: 100, y: 100, width: 3000, height: 2000 })
  expect(r).toEqual({ x: 0, y: 0, width: 1536, height: 864 })
})

it('leaves a partly off-screen window alone while its header is reachable', () => {
  const saved = { x: 1300, y: 100, width: 400, height: 400 }
  expect(fit(saved)).toEqual(saved)
})

it('relocates when only a sliver is visible', () => {
  const r = fit({ x: 1500, y: 100, width: 400, height: 400 })
  expect(r.x + r.width).toBeLessThanOrEqual(1536)
})
