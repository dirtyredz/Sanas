import type { ReactNode } from 'react'
import { Badge } from '../../controls/Badge'
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

/** Whether a stored secret exists; the value itself never reaches the renderer. */
export function KeyBadge({ set }: { set: boolean }): React.JSX.Element {
  return set ? <Badge tone="ok">Saved</Badge> : <Badge tone="warn">Not set</Badge>
}
