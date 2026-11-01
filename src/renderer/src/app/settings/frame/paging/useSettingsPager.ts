import { useCallback, useState } from 'react'
import { INITIAL_PAGER, selectPage, type PagerState } from './page-order'
import type { SettingsSectionId } from '../settings-sections'

/** Settings shows one section at a time. Only the page changes here; the draft lives above
 *  it (useSettingsDraft), so unsaved edits survive moving between pages. */
export function useSettingsPager(): [PagerState, (id: SettingsSectionId) => void] {
  const [state, setState] = useState(INITIAL_PAGER)
  const select = useCallback((id: SettingsSectionId) => setState((s) => selectPage(s, id)), [])
  return [state, select]
}
