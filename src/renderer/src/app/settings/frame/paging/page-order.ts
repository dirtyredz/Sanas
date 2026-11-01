import { SETTINGS_SECTIONS, type SettingsSectionId } from '../settings-sections'

/** Which way a page change moves through an ordered list of pages: further down the list is
 *  'forward', back up it is 'back', and staying put (or an id not in the list) is 'none'.
 *  Settings animates the incoming page from this: forward slides up (left in the narrow strip),
 *  back reverses, none does not animate. */
export type PageDirection = 'forward' | 'back' | 'none'

export function pageDirection<T>(order: readonly T[], from: T, to: T): PageDirection {
  const a = order.indexOf(from)
  const b = order.indexOf(to)
  if (a < 0 || b < 0 || a === b) return 'none'
  return b > a ? 'forward' : 'back'
}

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
