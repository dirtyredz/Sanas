import { OverlayButton } from '../../controls/OverlayButton'
import { OverlayTextArea } from '../../controls/OverlayTextArea'
import { composerAction } from './composer-state'
import type { OverlayComposerModel } from './useOverlayComposer'

/** The typed question view. All state lives in useOverlayComposer, above the workspaces. */
export function OverlayComposer({ model }: { model: OverlayComposerModel }): React.JSX.Element {
  const { state, screen, meetingId } = model
  const attached = screen.state.draft
  return (
    <div className="overlay-composer">
      <OverlayTextArea
        hideLabel
        label="Ask Sanas"
        ref={model.inputRef}
        rows={3}
        disabled={state.pending || meetingId === null}
        maxLength={4000}
        placeholder={meetingId === null ? 'Start a meeting to ask' : 'Type a question…'}
        value={state.draft}
        onChange={(e) => model.edit(e.target.value)}
        onKeyDown={(e) => {
          if (composerAction(e.key, e.shiftKey, e.nativeEvent.isComposing) !== 'submit') return
          e.preventDefault()
          void model.submit()
        }}
      />
      {attached && (
        <figure className="composer-attachment">
          <img src={attached.thumbnail} alt={`Attached screen: ${attached.display}`} />
          <figcaption>
            {attached.display}
            <span className="muted"> — sent with your question</span>
          </figcaption>
        </figure>
      )}
      <div className="composer-actions">
        <OverlayButton
          size="sm"
          busy={screen.state.attaching}
          disabled={state.pending || meetingId === null}
          onClick={() => void screen.attach()}
        >
          {screen.state.attaching ? 'Capturing…' : attached ? 'Replace screen' : 'Attach screen'}
        </OverlayButton>
        {attached && (
          <OverlayButton
            size="sm"
            variant="quiet"
            disabled={state.pending}
            onClick={() => void screen.remove()}
          >
            Remove
          </OverlayButton>
        )}
        <OverlayButton
          variant="primary"
          size="sm"
          className="composer-send"
          busy={state.pending}
          disabled={!model.canSend}
          onClick={() => void model.submit()}
        >
          Send
        </OverlayButton>
      </div>
      {screen.state.error && (
        <p className="ov-message ov-message--error" role="alert">
          {screen.state.error}
        </p>
      )}
      {state.error && (
        <p className="ov-message ov-message--error" role="alert">
          {state.error}
        </p>
      )}
    </div>
  )
}
