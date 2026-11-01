import { OverlayButton } from '../../controls/OverlayButton'
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
  /** A meeting is live or paused. */
  active: boolean
  requestBusy: boolean
}): React.JSX.Element {
  return (
    <div className="workspace-body">
      <OverlayComposer model={composer} />
      <div className="workspace-actions">
        <OverlayButton
          size="sm"
          variant="quiet"
          busy={manual.pending}
          disabled={!active || requestBusy}
          title="Suggest a question to ask the audience from the recent discussion"
          onClick={() => void manual.request('audience')}
        >
          Ask the audience
        </OverlayButton>
      </div>
    </div>
  )
}
