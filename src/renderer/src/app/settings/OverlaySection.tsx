import type { SettingsView } from '@shared/types'
import { SettingsSection } from './SettingsSection'

export function OverlaySection({
  view,
  onChange,
}: {
  view: SettingsView
  onChange: (patch: Partial<SettingsView>) => void
}): React.JSX.Element {
  return (
    <SettingsSection
      title="Overlay"
      description="The small always-on-top panel. Its 👻 button makes clicks pass through; the overlay hotkey brings it back."
    >
      <label className="field">
        <span className="label">Opacity ({Math.round(view.overlayOpacity * 100)}%)</span>
        <input
          type="range"
          min="0.4"
          max="1"
          step="0.05"
          value={view.overlayOpacity}
          onChange={(e) => onChange({ overlayOpacity: Number(e.target.value) })}
        />
        <small>Applies when you hit Save.</small>
      </label>
    </SettingsSection>
  )
}
