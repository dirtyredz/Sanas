import type { SettingsView } from '@shared/types'
import { FieldRow } from '../../controls/FieldRow'
import { KeyBadge, SettingsSection } from '../frame/SettingsSection'
import type { SecretKey } from '../frame/settings-draft'

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
      id="api-keys"
      description="Stored on this machine only; the app window never sees them in the clear."
    >
      <FieldRow
        label="Deepgram"
        badge={<KeyBadge set={view.deepgramKeySet} />}
        help="Live transcription. Type a new key to replace the saved one."
      >
        <input
          type="password"
          autoComplete="off"
          placeholder={view.deepgramKeySet ? 'Leave blank to keep' : 'dg_…'}
          value={secrets.deepgramApiKey}
          onChange={(e) => onSecret('deepgramApiKey', e.target.value)}
        />
      </FieldRow>

      <FieldRow
        label="Anthropic"
        badge={<KeyBadge set={view.anthropicKeySet} />}
        help="Suggestions, answers and summaries."
      >
        <input
          type="password"
          autoComplete="off"
          placeholder={view.anthropicKeySet ? 'Leave blank to keep' : 'sk-ant-…'}
          value={secrets.anthropicApiKey}
          onChange={(e) => onSecret('anthropicApiKey', e.target.value)}
        />
      </FieldRow>

      <FieldRow
        label="Anthropic workspace ID"
        badge={<span className="field-row-optional">Optional</span>}
        help='Only for org-level keys (the "not scoped to a workspace" error). Leave blank for a key created inside a workspace.'
      >
        <input
          type="text"
          placeholder="wrkspc_…"
          value={view.anthropicWorkspaceId}
          onChange={(e) => onChange({ anthropicWorkspaceId: e.target.value })}
        />
      </FieldRow>
    </SettingsSection>
  )
}
