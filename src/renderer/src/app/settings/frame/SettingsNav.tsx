import { SETTINGS_SECTIONS, type SettingsSectionId } from './settings-sections'

/** The Settings index: every section one click away, the current one highlighted, and a dot
 *  on any section that needs attention (a missing key or a value Save would refuse). */
export function SettingsNav({
  active,
  attention,
  onJump,
}: {
  active: SettingsSectionId
  attention: ReadonlySet<SettingsSectionId>
  onJump: (id: SettingsSectionId) => void
}): React.JSX.Element {
  return (
    <nav className="settings-nav" aria-label="Settings sections">
      <ul>
        {SETTINGS_SECTIONS.map(({ id, title }) => (
          <li key={id}>
            <button
              type="button"
              className={`settings-nav-item${active === id ? ' active' : ''}`}
              aria-current={active === id ? 'location' : undefined}
              onClick={() => onJump(id)}
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
