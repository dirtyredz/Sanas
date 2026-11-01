import { describe, expect, it } from 'vitest'
import { SETTINGS_SECTIONS } from './settings-sections'
import { INITIAL_PAGER, selectPage, stepPage } from './useSettingsPager'

describe('the Settings pager', () => {
  it('opens on the first section without animating', () => {
    expect(INITIAL_PAGER).toEqual({ active: SETTINGS_SECTIONS[0].id, direction: 'none' })
  })

  it('moves forward down the index and back up it', () => {
    const down = selectPage(INITIAL_PAGER, 'hotkeys')
    expect(down).toEqual({ active: 'hotkeys', direction: 'forward' })
    expect(selectPage(down, 'assistant')).toEqual({ active: 'assistant', direction: 'back' })
  })

  it('keeps the same state object when the shown page is selected again', () => {
    const state = selectPage(INITIAL_PAGER, 'overlay')
    expect(selectPage(state, 'overlay')).toBe(state)
  })

  it('steps through the index for Up/Down and stops at either end', () => {
    expect(stepPage('assistant', 1)).toBe('hotkeys')
    expect(stepPage('assistant', -1)).toBe('api-keys')
    expect(stepPage('api-keys', -1)).toBe('api-keys')
    expect(stepPage('updates', 1)).toBe('updates')
  })
})
