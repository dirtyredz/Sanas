import { AudienceButton } from '../../suggestions/AudienceButton'
import type { ManualRequestsModel } from '../../suggestions/useManualRequests'
import { OverlayComposer } from './OverlayComposer'
import type { OverlayComposerModel } from './useOverlayComposer'

/** Ask: the typed question with its screen attachment, plus Ask the audience. Answers land in
 *  the answer surface above; Ask stays open so the owner can follow up. */
export function AskWorkspace({
  composer,
  manual,
  active,
  requestBusy,
}: {
  composer: OverlayComposerModel
  manual: ManualRequestsModel
  active: boolean
  requestBusy: boolean
}): React.JSX.Element {
  return (
    <div className="workspace-body">
      <OverlayComposer model={composer} />
      <div className="workspace-actions">
        <AudienceButton manual={manual} active={active} requestBusy={requestBusy} />
      </div>
    </div>
  )
}
