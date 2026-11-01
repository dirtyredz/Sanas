import type { SettingsView } from '@shared/types'
import { ApiKeysSection } from './ApiKeysSection'
import { AssistantSection } from './AssistantSection'
import { EmailSection } from './EmailSection'
import { HotkeysSection } from './HotkeysSection'
import { MicrophoneSection } from './MicrophoneSection'
import { OverlaySection } from './OverlaySection'
import { RetentionSection } from './RetentionSection'
import { UpdatesSection } from './UpdatesSection'
import type { SecretKey, SettingsProblem } from '../frame/settings-draft'
import type { SettingsSectionId } from '../frame/settings-sections'

/** The one section a Settings page shows. Every value comes from the shared draft, so a page
 *  can unmount when the user moves on without losing an unsaved edit. */
export function SettingsSectionPage({
  id,
  view,
  secrets,
  problems,
  savedAt,
  onChange,
  onSecret,
}: {
  id: SettingsSectionId
  view: SettingsView
  secrets: Readonly<Record<SecretKey, string>>
  problems: readonly SettingsProblem[]
  savedAt: number
  onChange: (patch: Partial<SettingsView>) => void
  onSecret: (key: SecretKey, value: string) => void
}): React.JSX.Element {
  switch (id) {
    case 'api-keys':
      return (
        <ApiKeysSection view={view} secrets={secrets} onChange={onChange} onSecret={onSecret} />
      )
    case 'assistant':
      return <AssistantSection view={view} problems={problems} onChange={onChange} />
    case 'hotkeys':
      return <HotkeysSection view={view} onChange={onChange} />
    case 'microphone':
      return <MicrophoneSection view={view} onChange={onChange} />
    case 'overlay':
      return <OverlaySection view={view} onChange={onChange} />
    case 'email':
      return <EmailSection view={view} secrets={secrets} onChange={onChange} onSecret={onSecret} />
    case 'retention':
      return <RetentionSection view={view} savedAt={savedAt} onChange={onChange} />
    case 'updates':
      return <UpdatesSection />
  }
}
