import type { SettingsView } from '@shared/types'
import { FieldRow } from '../../controls/FieldRow'
import { Switch } from '../../controls/Switch'
import { KeyBadge, SettingsSection } from '../frame/SettingsSection'
import type { SecretKey } from '../frame/settings-draft'

export function EmailSection({
  view,
  secrets,
  onChange,
  onSecret,
}: {
  view: SettingsView
  secrets: Record<SecretKey, string>
  onChange: (patch: Partial<SettingsView>) => void
  onSecret: (key: SecretKey, value: string) => void
}): React.JSX.Element {
  return (
    <SettingsSection
      id="email"
      description="Each job has its own recipient (set on the job page). This is the account Sanas sends from."
    >
      <FieldRow
        label="Email the summary when a meeting stops"
        help="Only for jobs that have an address."
      >
        <Switch
          checked={view.summaryEmailAuto}
          onChange={(summaryEmailAuto) => onChange({ summaryEmailAuto })}
        />
      </FieldRow>

      <FieldRow label="SMTP server">
        <input
          type="text"
          placeholder="smtp.gmail.com"
          value={view.smtpHost}
          onChange={(e) => onChange({ smtpHost: e.target.value })}
        />
      </FieldRow>

      <FieldRow label="Port" help="465 (TLS) or 587 (STARTTLS).">
        <input
          type="number"
          min={1}
          max={65535}
          value={view.smtpPort}
          onChange={(e) =>
            // clamp here: the schema would drop an out-of-range port and the field would revert
            onChange({
              smtpPort: Math.min(65_535, Math.max(1, Math.trunc(Number(e.target.value)) || 465)),
            })
          }
        />
      </FieldRow>

      <FieldRow label="Login (also the From address)">
        <input
          type="text"
          placeholder="you@gmail.com"
          value={view.smtpUser}
          onChange={(e) => onChange({ smtpUser: e.target.value })}
        />
      </FieldRow>

      <FieldRow
        label="Password"
        badge={<KeyBadge set={view.smtpPassSet} />}
        help="For Gmail, an App Password (needs 2-step verification), not your login password."
      >
        <input
          type="password"
          autoComplete="off"
          placeholder={view.smtpPassSet ? 'Leave blank to keep' : 'App password'}
          value={secrets.smtpPass}
          onChange={(e) => onSecret('smtpPass', e.target.value)}
        />
      </FieldRow>
    </SettingsSection>
  )
}
