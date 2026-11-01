import { useCallback, useState } from 'react'
import { pageDirection, type PageDirection } from './page-direction'
import { SETTINGS_SECTIONS, type SettingsSectionId } from './settings-sections'

const ORDER: readonly SettingsSectionId[] = SETTINGS_SECTIONS.map((s) => s.id)

/** The one Settings page on screen and the way the last change moved (for its animation). */
export interface PagerState {
  active: SettingsSectionId
  direction: PageDirection
}

/** Settings opens on the first page, without an entrance animation. */
export const INITIAL_PAGER: PagerState = { active: ORDER[0], direction: 'none' }

/** Selecting the page already shown changes nothing, so it does not replay the animation. */
export function selectPage(state: PagerState, id: SettingsSectionId): PagerState {
  if (id === state.active) return state
  return { active: id, direction: pageDirection(ORDER, state.active, id) }
}

/** The page `delta` steps from `id` in index order, stopping at either end. */
export function stepPage(id: SettingsSectionId, delta: number): SettingsSectionId {
  const index = Math.min(ORDER.length - 1, Math.max(0, ORDER.indexOf(id) + delta))
  return ORDER[index]
}

/** Settings shows one section at a time. Only the page changes here; the draft lives above
 *  it (useSettingsDraft), so unsaved edits survive moving between pages. */
export function useSettingsPager(): [PagerState, (id: SettingsSectionId) => void] {
  const [state, setState] = useState(INITIAL_PAGER)
  const select = useCallback((id: SettingsSectionId) => setState((s) => selectPage(s, id)), [])
  return [state, select]
}
