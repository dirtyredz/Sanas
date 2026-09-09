import type { SettingsView } from '@shared/types'
import { SetBadge, SettingsSection, type SecretKey } from './SettingsSection'

export function ApiKeysSection({
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
      title="API keys"
      description="Stored on this machine only; the app window never sees them in the clear."
    >
      <label className="field">
        <span className="label">
          Deepgram <SetBadge set={view.deepgramKeySet} />
        </span>
        <input
          type="password"
          placeholder={view.deepgramKeySet ? '•••••••• (leave blank to keep)' : 'dg_…'}
          value={secrets.deepgramApiKey}
          onChange={(e) => onSecret('deepgramApiKey', e.target.value)}
        />
      </label>

      <label className="field">
        <span className="label">
          Anthropic <SetBadge set={view.anthropicKeySet} />
        </span>
        <input
          type="password"
          placeholder={view.anthropicKeySet ? '•••••••• (leave blank to keep)' : 'sk-ant-…'}
          value={secrets.anthropicApiKey}
          onChange={(e) => onSecret('anthropicApiKey', e.target.value)}
        />
      </label>

      <label className="field">
        <span className="label">Anthropic workspace ID (optional)</span>
        <input
          type="text"
          placeholder="wrkspc_…"
          value={view.anthropicWorkspaceId}
          onChange={(e) => onChange({ anthropicWorkspaceId: e.target.value })}
        />
        <small>
          Only for org-level keys (the "not scoped to a workspace" error). Leave blank for a key
          created inside a workspace.
        </small>
      </label>
    </SettingsSection>
  )
}
