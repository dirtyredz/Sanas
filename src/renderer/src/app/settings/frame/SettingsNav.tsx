import type { KeyboardEvent } from 'react'
import { SETTINGS_SECTIONS, type SettingsSectionId } from './settings-sections'
import { stepPage } from './useSettingsPager'

/** DOM id of the scrolling pane that shows the selected page. */
export const SETTINGS_PANE_ID = 'settings-pane'

const STEP_KEYS: Readonly<Record<string, number>> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
}

/** The Settings index: one button per page, the shown one highlighted, and a dot on any page
 *  that needs attention (a missing key or a value Save would refuse). Up/Down (Left/Right in
 *  the narrow strip) move to the neighbouring page and take focus with them. */
export function SettingsNav({
  active,
  attention,
  onSelect,
}: {
  active: SettingsSectionId
  attention: ReadonlySet<SettingsSectionId>
  onSelect: (id: SettingsSectionId) => void
}): React.JSX.Element {
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>): void => {
    const delta = STEP_KEYS[event.key]
    const from = (event.target as HTMLElement).dataset.section as SettingsSectionId | undefined
    if (!delta || !from) return
    event.preventDefault()
    const next = stepPage(from, delta)
    onSelect(next)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-section="${next}"]`)?.focus()
  }

  return (
    <nav className="settings-nav" aria-label="Settings pages">
      <ul onKeyDown={onKeyDown}>
        {SETTINGS_SECTIONS.map(({ id, title }) => (
          <li key={id}>
            <button
              type="button"
              data-section={id}
              className={`settings-nav-item${active === id ? ' active' : ''}`}
              aria-current={active === id ? 'page' : undefined}
              aria-controls={SETTINGS_PANE_ID}
              onClick={() => onSelect(id)}
            >
              <span>{title}</span>
              {attention.has(id) && (
                <span className="settings-nav-flag" role="img" aria-label="needs attention" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
