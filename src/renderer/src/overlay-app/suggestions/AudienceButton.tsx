import { OverlayButton } from '../controls/OverlayButton'
import type { ManualRequestsModel } from './useManualRequests'

/** Ask the audience — one handler (useManualRequests) for Ask and Slide. The answer and any
 *  refusal ("nothing heard yet") show on the answer surface. */
export function AudienceButton({
  manual,
  active,
  requestBusy,
}: {
  manual: ManualRequestsModel
  /** A meeting is live or paused. */
  active: boolean
  requestBusy: boolean
}): React.JSX.Element {
  return (
    <OverlayButton
      size="sm"
      busy={manual.pending}
      disabled={!active || requestBusy}
      title="Suggest a question to ask the audience from the recent discussion"
      onClick={() => void manual.request('audience')}
    >
      Ask the audience
    </OverlayButton>
  )
}
