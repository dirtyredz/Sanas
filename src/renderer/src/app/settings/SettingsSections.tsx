import type { SettingsView } from '@shared/types'
import { ApiKeysSection } from './sections/ApiKeysSection'
import { AssistantSection } from './sections/AssistantSection'
import { EmailSection } from './sections/EmailSection'
import { HotkeysSection } from './sections/HotkeysSection'
import { MicrophoneSection } from './sections/MicrophoneSection'
import { OverlaySection } from './sections/OverlaySection'
import { RetentionSection } from './sections/RetentionSection'
import { UpdatesSection } from './sections/UpdatesSection'
import type { SecretKey, SettingsProblem } from './frame/settings-draft'

/** The section cards in page order — the order frame/settings-sections.ts lists (a test
 *  renders this and compares). */
export function SettingsSections({
  view,
  secrets,
  problems,
  savedAt,
  onChange,
  onSecret,
}: {
  view: SettingsView
  secrets: Readonly<Record<SecretKey, string>>
  problems: readonly SettingsProblem[]
  savedAt: number
  onChange: (patch: Partial<SettingsView>) => void
  onSecret: (key: SecretKey, value: string) => void
}): React.JSX.Element {
  return (
    <>
      <ApiKeysSection view={view} secrets={secrets} onChange={onChange} onSecret={onSecret} />
      <AssistantSection view={view} problems={problems} onChange={onChange} />
      <HotkeysSection view={view} onChange={onChange} />
      <MicrophoneSection view={view} onChange={onChange} />
      <OverlaySection view={view} onChange={onChange} />
      <EmailSection view={view} secrets={secrets} onChange={onChange} onSecret={onSecret} />
      <RetentionSection view={view} savedAt={savedAt} onChange={onChange} />
      <UpdatesSection />
    </>
  )
}
