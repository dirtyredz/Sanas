import { describe, expect, it } from 'vitest'
import { activeSectionId, SETTINGS_SECTIONS } from './settings-sections'

const at = (...tops: number[]): { id: string; top: number }[] =>
  tops.map((top, i) => ({ id: `s${i}`, top }))

describe('activeSectionId', () => {
  it('is the first section before anything has scrolled past the threshold', () => {
    expect(activeSectionId(at(20, 400, 900), 96, false)).toBe('s0')
  })

  it('is the last section whose top has passed the threshold', () => {
    expect(activeSectionId(at(-500, 60, 700), 96, false)).toBe('s1')
    expect(activeSectionId(at(-900, -300, 96), 96, false)).toBe('s2')
  })

  it('is the last section at the bottom of the page, however short it is', () => {
    expect(activeSectionId(at(-900, -300, 500), 96, true)).toBe('s2')
  })

  it('has nothing to report with no sections', () => {
    expect(activeSectionId([], 96, false)).toBeNull()
  })
})

it('gives every section a unique id', () => {
  const ids = SETTINGS_SECTIONS.map((s) => s.id)
  expect(new Set(ids).size).toBe(ids.length)
})
