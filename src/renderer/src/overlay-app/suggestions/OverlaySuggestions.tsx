import type { ReactNode } from 'react'
import { suggestionArrivalLabel, suggestionLabel } from '@shared/suggestion-label'
import { SuggestionContent } from '../../lib/suggestions/SuggestionContent'
import { OverlayButton } from '../controls/OverlayButton'
import { canRequestDetail, findStored } from './manual-requests'
import type { ManualRequestsModel } from './useManualRequests'
import type { OverlaySuggestionsModel } from './useOverlaySuggestions'

/** The selected answer: label, Answer now, history, card actions and the body. `preview` is
 *  the compact form shown above a secondary workspace; it keeps the same scroll container so
 *  the reading position survives switching back to the full answer. */
export function OverlaySuggestions({
  model,
  manual,
  live,
  mode = 'full',
  onReadFull,
  actions,
}: {
  model: OverlaySuggestionsModel
  manual: ManualRequestsModel
  live: boolean
  mode?: 'full' | 'preview'
  onReadFull?: () => void
  /** Extra actions shown beside the card's own (legacy layout only). */
  actions?: ReactNode
}): React.JSX.Element {
  const { items, selected, selectedIndex, latest } = model
  const requestBusy = model.requestedInFlight || manual.pending
  const full = mode === 'full'
  const source = selected?.sourceSuggestionId
    ? findStored(items, selected.sourceSuggestionId)
    : undefined
  return (
    <section className={`overlay-suggestion ${full ? '' : 'is-preview'}`} aria-label="Answer">
      <div className="suggestion-bar">
        <span className="suggestion-label">
          {selected ? suggestionLabel(selected) : 'Answer'}
          {selected?.streaming && <span className="cursor" aria-hidden="true" />}
        </span>
        {model.earlierContext && <span className="ov-badge">Earlier context</span>}
        <OverlayButton
          variant="primary"
          size="sm"
          className="answer-now"
          disabled={!live || requestBusy}
          busy={model.requestedInFlight}
          onClick={() => void window.sanas.assist.now()}
        >
          Answer now
        </OverlayButton>
      </div>
      {model.hasNewAnswer && latest && (
        <OverlayButton
          size="sm"
          className="new-answer"
          onClick={() => model.select(latest.suggestionId)}
        >
          {suggestionArrivalLabel(latest)} ›
        </OverlayButton>
      )}
      <div
        className="suggestion-content"
        ref={model.scrollRef}
        onScroll={model.onScroll}
        tabIndex={-1}
      >
        {selected?.error && <p className="ov-message ov-message--error">{selected.error}</p>}
        {selected && !selected.error && (
          <SuggestionContent text={selected.text} manualKind={selected.manualKind} />
        )}
        {!selected && (
          <p className="suggestion-empty">
            {live
              ? 'Listening for key moments — or press Answer now.'
              : 'Suggestions appear here during your meeting.'}
          </p>
        )}
      </div>
      {!full && selected && onReadFull && (
        <div className="suggestion-preview-actions">
          <OverlayButton variant="quiet" size="sm" onClick={onReadFull}>
            Read full answer
          </OverlayButton>
        </div>
      )}
      {full && (items.length > 1 || canRequestDetail(selected) || source || actions) && (
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
          {actions}
        </div>
      )}
      {manual.notice && (
        <p className="ov-message" role="status">
          {manual.notice}
        </p>
      )}
    </section>
  )
}
