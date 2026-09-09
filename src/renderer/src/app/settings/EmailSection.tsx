import type { SettingsView } from '@shared/types'
import { SetBadge, SettingsSection, type SecretKey } from './SettingsSection'

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
      title="Summary email"
      description="Each job has its own recipient (set on the job page). This is the account Sanas sends from."
    >
      <label className="check">
        <input
          type="checkbox"
          checked={view.summaryEmailAuto}
          onChange={(e) => onChange({ summaryEmailAuto: e.target.checked })}
        />
        Email the summary automatically when a meeting stops (jobs with an address only)
      </label>

      <label className="field">
        <span className="label">SMTP server</span>
        <input
          type="text"
          placeholder="smtp.gmail.com"
          value={view.smtpHost}
          onChange={(e) => onChange({ smtpHost: e.target.value })}
        />
      </label>

      <label className="field">
        <span className="label">Port</span>
        <input
          type="number"
          value={view.smtpPort}
          onChange={(e) => onChange({ smtpPort: Number(e.target.value) || 465 })}
        />
        <small>465 (TLS) or 587 (STARTTLS).</small>
      </label>

      <label className="field">
        <span className="label">Login (also the From address)</span>
        <input
          type="text"
          placeholder="you@gmail.com"
          value={view.smtpUser}
          onChange={(e) => onChange({ smtpUser: e.target.value })}
        />
      </label>

      <label className="field">
        <span className="label">
          Password <SetBadge set={view.smtpPassSet} />
        </span>
        <input
          type="password"
          placeholder={view.smtpPassSet ? '•••••••• (leave blank to keep)' : 'app password'}
          value={secrets.smtpPass}
          onChange={(e) => onSecret('smtpPass', e.target.value)}
        />
        <small>
          For Gmail, an App Password (needs 2-step verification), not your login password.
        </small>
      </label>
    </SettingsSection>
  )
}
