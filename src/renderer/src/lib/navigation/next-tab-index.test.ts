import { describe, expect, it } from 'vitest'
import { nextTabIndex } from './next-tab-index'

describe.each(['horizontal', 'vertical'] as const)('%s tab navigation', (orientation) => {
  const [forward, backward, offAxis] =
    orientation === 'horizontal'
      ? ['ArrowRight', 'ArrowLeft', 'ArrowDown']
      : ['ArrowDown', 'ArrowUp', 'ArrowRight']

  it('moves in both directions and wraps at both ends', () => {
    expect(nextTabIndex(forward, 1, 4, orientation)).toBe(2)
    expect(nextTabIndex(backward, 2, 4, orientation)).toBe(1)
    expect(nextTabIndex(forward, 3, 4, orientation)).toBe(0)
    expect(nextTabIndex(backward, 0, 4, orientation)).toBe(3)
  })

  it('supports Home/End and ignores unrelated and off-axis keys', () => {
    expect(nextTabIndex('Home', 2, 4, orientation)).toBe(0)
    expect(nextTabIndex('End', 1, 4, orientation)).toBe(3)
    for (const key of [offAxis, 'Tab', 'Enter', 'Escape', ' ']) {
      expect(nextTabIndex(key, 1, 4, orientation)).toBeNull()
    }
  })

  it('handles single and empty tab lists', () => {
    for (const key of [forward, backward, 'Home', 'End']) {
      expect(nextTabIndex(key, 0, 1, orientation)).toBe(0)
      expect(nextTabIndex(key, 0, 0, orientation)).toBeNull()
    }
  })
})
