import type { SettingsView } from '@shared/types'
import { FieldRow } from '../../controls/FieldRow'
import { SettingsSection } from '../frame/SettingsSection'

export function OverlaySection({
  view,
  onChange,
}: {
  view: SettingsView
  onChange: (patch: Partial<SettingsView>) => void
}): React.JSX.Element {
  return (
    <SettingsSection
      id="overlay"
      description="The small always-on-top panel. Its ghost button makes clicks pass through; the overlay hotkey brings it back."
    >
      <FieldRow
        label="Opacity"
        badge={<span className="field-row-value">{Math.round(view.overlayOpacity * 100)}%</span>}
        help="Applies when you save."
        layout="stack"
      >
        <input
          type="range"
          className="range"
          style={
            {
              '--range-fill': `${((view.overlayOpacity - 0.4) / 0.6) * 100}%`,
            } as React.CSSProperties
          }
          min="0.4"
          max="1"
          step="0.05"
          value={view.overlayOpacity}
          onChange={(e) => onChange({ overlayOpacity: Number(e.target.value) })}
        />
      </FieldRow>
    </SettingsSection>
  )
}
