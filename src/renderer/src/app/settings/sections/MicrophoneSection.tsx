import { useEffect, useState } from 'react'
import type { SettingsView } from '@shared/types'
import { FieldRow } from '../../controls/FieldRow'
import { Switch } from '../../controls/Switch'
import { SettingsSection } from '../frame/SettingsSection'

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
      id="microphone"
      description="Where the meeting is (this PC, or elsewhere) is chosen per meeting on the Live page."
    >
      <FieldRow label="Input device">
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
      </FieldRow>

      <FieldRow
        label="Save meeting audio to disk"
        help="WAV, local only. Needed for the post-meeting pass that gives speakers stable labels. See Retention for how long it is kept."
      >
        <Switch checked={view.recordAudio} onChange={(recordAudio) => onChange({ recordAudio })} />
      </FieldRow>
    </SettingsSection>
  )
}
