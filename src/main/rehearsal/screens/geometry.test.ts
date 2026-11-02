import { expect, it } from 'vitest'
import { mapRectangle } from './geometry'

it('maps the retained 1.25-scale work area once into the desktop thumbnail', () => {
  const display = { x: 0, y: 0, width: 1536, height: 864 }
  const content = { x: 0, y: 0, width: 1536, height: 816 }
  expect(mapRectangle(content, display, { width: 1429, height: 804 })).toEqual({
    x: 0,
    y: 0,
    width: 1429,
    height: 759,
  })
  // Baseline capturePage is 1920x1020 pixels; it fills only this rectangle, not 804px.
  expect(
    mapRectangle({ ...content, x: -1536 }, { ...display, x: -1536 }, { width: 1429, height: 804 }),
  ).toEqual({ x: 0, y: 0, width: 1429, height: 759 })
})
it('rejects an overlay outside actual fixture content', () => {
  expect(() =>
    mapRectangle(
      { x: 0, y: 800, width: 100, height: 40 },
      { x: 0, y: 0, width: 1536, height: 816 },
      { width: 1429, height: 759 },
    ),
  ).toThrow('outside')
})
