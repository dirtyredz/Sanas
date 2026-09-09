import { useEffect, useState } from 'react'
import type { SettingsView } from '@shared/types'
import { SettingsSection } from './SettingsSection'

export function MicrophoneSection({
  view,
  onChange,
}: {
  view: SettingsView
  onChange: (patch: Partial<SettingsView>) => void
}): React.JSX.Element {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])

  useEffect(() => {
    navigator.mediaDevices
      .enumerateDevices()
      .then((all) => setDevices(all.filter((d) => d.kind === 'audioinput')))
      .catch(() => setDevices([]))
  }, [])

  return (
    <SettingsSection
      title="Microphone"
      description="Where the meeting is (this PC, or elsewhere) is chosen per meeting on the Live page."
    >
      <label className="field">
        <span className="label">Input device</span>
        <select
          value={view.audioDeviceId}
          onChange={(e) => onChange({ audioDeviceId: e.target.value })}
        >
          <option value="">System default</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={view.recordAudio}
          onChange={(e) => onChange({ recordAudio: e.target.checked })}
        />
        <span>
          Save meeting audio to disk (WAV, local only)
          <br />
          <small className="hint">
            Needed for the post-meeting pass that gives speakers stable labels. See Retention for
            how long it is kept.
          </small>
        </span>
      </label>
    </SettingsSection>
  )
}
