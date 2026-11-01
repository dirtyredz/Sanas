import type { OverlaySettingsModel } from '../layout/useOverlaySettings'

/** Whole-window opacity (Electron), kept in sync with Settings. 40–100%. */
export function OverlayOpacity({
  settings,
}: {
  settings: OverlaySettingsModel
}): React.JSX.Element {
  const percent = Math.round(settings.overlayOpacity * 100)
  return (
    <label className="ov-range">
      <span className="ov-range-label">Opacity</span>
      <input
        type="range"
        min="0.4"
        max="1"
        step="0.05"
        value={settings.overlayOpacity}
        aria-valuetext={`${percent}%`}
        onChange={(event) => settings.changeOpacity(Number(event.target.value))}
      />
      <span className="ov-range-value">{percent}%</span>
    </label>
  )
}
