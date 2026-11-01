import type { ReactNode } from 'react'
import type { PageDirection } from './paging/page-order'
import type { SettingsSectionId } from './settings-sections'

/** DOM id of the scrolling pane that shows the selected page. */
export const SETTINGS_PANE_ID = 'settings-pane'

/** The selected Settings page in its own scroll area. The caller keys it by page, so a switch
 *  mounts a fresh pane (scrolled to the top) whose CSS entrance runs in `direction`
 *  (settings.css; reduced motion only cross-fades). */
export function SettingsPane({
  page,
  direction,
  children,
}: {
  page: SettingsSectionId
  direction: PageDirection
  children: ReactNode
}): React.JSX.Element {
  return (
    <div
      id={SETTINGS_PANE_ID}
      className={`settings-pane settings-pane--${direction}`}
      data-page={page}
    >
      {children}
    </div>
  )
}
