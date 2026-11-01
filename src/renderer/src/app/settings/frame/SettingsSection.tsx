import type { ReactNode } from 'react'
import { sectionAnchor, sectionTitle, type SettingsSectionId } from './settings-sections'

/** One card of the Settings page: its title (from the section list), one line of what it
 *  governs, then its FieldRows. The id is the index's scroll target. */
export function SettingsSection({
  id,
  description,
  children,
}: {
  id: SettingsSectionId
  description?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  const anchor = sectionAnchor(id)
  return (
    <section
      id={anchor}
      className="settings-section"
      aria-labelledby={`${anchor}-title`}
      tabIndex={-1}
    >
      <header className="settings-section-head">
        <h3 id={`${anchor}-title`}>{sectionTitle(id)}</h3>
        {description && <p>{description}</p>}
      </header>
      <div className="settings-section-body">{children}</div>
    </section>
  )
}
