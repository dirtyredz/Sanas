import { OverlayButton } from '../controls/OverlayButton'
import { canRequestDetail, findStored } from './manual-requests'
import type { ManualRequestsModel } from './useManualRequests'
import type { OverlaySuggestionsModel } from './useOverlaySuggestions'

/** The full answer's action row: history navigation, More detail and Back to source. Renders
 *  nothing when there is no history, no detail request and no source to go back to. */
export function AnswerActions({
  model,
  manual,
  live,
}: {
  model: OverlaySuggestionsModel
  manual: ManualRequestsModel
  live: boolean
}): React.JSX.Element | null {
  const { items, selected, selectedIndex, latest } = model
  const requestBusy = model.requestedInFlight || manual.pending
  const source = selected?.sourceSuggestionId
    ? findStored(items, selected.sourceSuggestionId)
    : undefined
  if (!(items.length > 1 || canRequestDetail(selected) || source)) return null
  return (
    <div className="suggestion-actions">
      {items.length > 1 && (
        <span className="suggestion-nav" role="group" aria-label="Answer history">
          <OverlayButton
            variant="icon"
            aria-label="Previous answer"
            disabled={selectedIndex <= 0}
            onClick={() => model.select(items[selectedIndex - 1].suggestionId)}
          >
            ‹
          </OverlayButton>
          <span className="suggestion-index">
            {selectedIndex + 1}/{items.length}
          </span>
          <OverlayButton
            variant="icon"
            aria-label="Next answer"
            disabled={selectedIndex < 0 || selectedIndex >= items.length - 1}
            onClick={() => model.select(items[selectedIndex + 1].suggestionId)}
          >
            ›
          </OverlayButton>
          <OverlayButton
            variant="quiet"
            size="sm"
            disabled={!model.hasNewAnswer}
            onClick={() => latest && model.select(latest.suggestionId)}
          >
            Latest
          </OverlayButton>
        </span>
      )}
      {canRequestDetail(selected) && (
        <OverlayButton
          size="sm"
          disabled={!live || requestBusy}
          busy={manual.pending}
          onClick={() => void manual.request('detail')}
        >
          More detail
        </OverlayButton>
      )}
      {source && (
        <OverlayButton size="sm" onClick={() => model.select(source.suggestionId)}>
          Back to source
        </OverlayButton>
      )}
    </div>
  )
}
