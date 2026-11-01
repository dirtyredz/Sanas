import { expect, it } from 'vitest'
import { SETTINGS_SECTIONS } from './settings-sections'

it('gives every section a unique id', () => {
  const ids = SETTINGS_SECTIONS.map((s) => s.id)
  expect(new Set(ids).size).toBe(ids.length)
})
