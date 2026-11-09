import type { MeetingState } from '@shared/types'
import { suggestionArrivalLabel, suggestionLabel } from '@shared/suggestion/suggestion-label'
import { SuggestionContent } from '../../lib/suggestions/SuggestionContent'
import { OverlayButton } from '../controls/OverlayButton'
import { IconExpand } from '../controls/overlay-icons'
import { OpenSanasButton } from '../controls/OpenSanasButton'
import { AnswerActions } from './AnswerActions'
import type { ManualRequestsModel } from './useManualRequests'
import type { OverlaySuggestionsModel } from './useOverlaySuggestions'
import { OverlayTip } from '../controls/OverlayTip'

/** The selected answer: label, Answer now, history, card actions and the body. `preview` is
 *  the compact form shown above a secondary workspace (history and card actions live in the
 *  full view). It keeps the same scroll container so
 *  the reading position survives switching back to the full answer. */
export function OverlaySuggestions({
  model,
  manual,
  live,
  status = 'idle',
  mode = 'full',
  onReadFull,
}: {
  model: OverlaySuggestionsModel
  manual: ManualRequestsModel
  live: boolean
  /** The meeting's status, for the empty-state copy. */
  status?: MeetingState['status']
  mode?: 'full' | 'preview'
  onReadFull?: () => void
}): React.JSX.Element {
  const { selected, latest } = model
  const full = mode === 'full'
  return (
    <section className={`overlay-suggestion ${full ? '' : 'is-preview'}`} aria-label="Answer">
      <div className="suggestion-bar">
        <span className="suggestion-label">
          {selected ? suggestionLabel(selected) : 'Answer'}
          {selected?.streaming && <span className="cursor" aria-hidden="true" />}
        </span>
        {model.earlierContext && (
          <OverlayTip text="Grounded in an earlier version of the meeting context">
            <span className="ov-badge">Earlier context</span>
          </OverlayTip>
        )}
        {model.hasNewAnswer && latest && (
          <OverlayButton
            size="sm"
            variant="quiet"
            className="new-answer"
            onClick={() => model.select(latest.suggestionId)}
          >
            {suggestionArrivalLabel(latest)} ›
          </OverlayButton>
        )}
        <span className="suggestion-bar-end">
          {!full && selected && onReadFull && (
            <OverlayTip text="Read the full answer (Ctrl+1)">
              <OverlayButton variant="icon" aria-label="Read the full answer" onClick={onReadFull}>
                <IconExpand />
              </OverlayButton>
            </OverlayTip>
          )}
          <OverlayButton
            variant="primary"
            size="sm"
            className="answer-now"
            disabled={!live}
            onClick={() => void window.sanas.assist.now()}
          >
            Answer now
          </OverlayButton>
        </span>
      </div>
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
          <div className="suggestion-empty">
            {status === 'error' ? (
              <p>Listening stopped. The details are above.</p>
            ) : live ? (
              <p>
                {status === 'paused'
                  ? 'Paused. Answer now and Ask still work.'
                  : 'Listening for key moments — or press Answer now.'}
              </p>
            ) : (
              <>
                <p>Start a meeting in Sanas.</p>
                <OpenSanasButton variant="secondary" />
                <p>Suggestions appear here during your meeting.</p>
              </>
            )}
          </div>
        )}
      </div>
      {full && <AnswerActions model={model} manual={manual} live={live} />}
      {manual.notice && (
        <p className="ov-message" role="status">
          {manual.notice}
        </p>
      )}
    </section>
  )
}
