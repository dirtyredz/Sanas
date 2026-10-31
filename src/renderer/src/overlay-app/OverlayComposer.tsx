import type { Admission } from '@shared/live-controls/types'
import { useEffect, useRef, useReducer } from 'react'
import { useCaptureDraft } from './capture/useCaptureDraft'

export interface ComposerState {
  open: boolean
  draft: string
  pending: boolean
  error: string
}
type ComposerEvent =
  | { type: 'open' | 'close' | 'begin' }
  | { type: 'edit'; text: string }
  | { type: 'result'; result: Admission }
  | { type: 'failure'; message: string }
export function composerReducer(state: ComposerState, event: ComposerEvent): ComposerState {
  switch (event.type) {
    case 'open':
      return { ...state, open: true }
    case 'close':
      return { ...state, open: false }
    case 'edit':
      return { ...state, draft: event.text }
    case 'begin':
      return { ...state, pending: true, error: '' }
    case 'failure':
      return { ...state, pending: false, error: event.message }
    case 'result':
      return {
        ...state,
        pending: false,
        draft: event.result.accepted ? '' : state.draft,
        error: event.result.accepted ? '' : event.result.message,
      }
  }
}
export function composerAction(
  key: string,
  shift: boolean,
  composing: boolean,
): 'submit' | 'close' | null {
  if (composing) return null
  return key === 'Escape' ? 'close' : key === 'Enter' && !shift ? 'submit' : null
}
/** After a send: an accepted request consumed the attachment; an expired one is gone in main.
 *  Any other refusal keeps both the text and the attachment for another try. */
export function attachmentAfterSend(result: Admission): 'keep' | 'clear' {
  return result.accepted || result.reason === 'attachment-expired' ? 'clear' : 'keep'
}
export function OverlayComposer({
  meetingId,
  busy,
}: {
  meetingId: number | null
  busy: boolean
}): React.JSX.Element {
  const [{ open, draft, pending, error }, dispatch] = useReducer(composerReducer, {
    open: false,
    draft: '',
    pending: false,
    error: '',
  })
  const screen = useCaptureDraft(meetingId)
  const attached = screen.state.draft
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const remove = window.sanas.overlay.onCompose(() => {
      dispatch({ type: 'open' })
      requestAnimationFrame(() => input.current?.focus())
    })
    void window.sanas.overlay.composerReady()
    return remove
  }, [])
  const submit = async (): Promise<void> => {
    if (busy || pending || meetingId === null || !draft.trim() || screen.state.attaching) return
    dispatch({ type: 'begin' })
    try {
      const result = await window.sanas.assist.request({
        meetingId,
        kind: 'typed',
        text: draft,
        ...(attached ? { captureToken: attached.token } : {}),
      })
      dispatch({ type: 'result', result })
      if (attached && attachmentAfterSend(result) === 'clear') screen.cleared()
    } catch (e) {
      dispatch({ type: 'failure', message: String(e) })
    }
  }
  return (
    <div className="overlay-composer">
      <button
        disabled={meetingId === null}
        onClick={() => void window.sanas.overlay.activateComposer()}
      >
        Ask…
      </button>
      {open && (
        <>
          <textarea
            disabled={pending}
            ref={input}
            aria-label="Ask Sanas"
            maxLength={4000}
            value={draft}
            onChange={(e) => dispatch({ type: 'edit', text: e.target.value })}
            onKeyDown={(e) => {
              const action = composerAction(e.key, e.shiftKey, e.nativeEvent.isComposing)
              if (action) e.preventDefault()
              if (action === 'submit') void submit()
              if (action === 'close') {
                dispatch({ type: 'close' })
                void window.sanas.overlay.releaseFocus()
              }
            }}
          />
          <div className="composer-attachment">
            {attached && (
              <figure>
                <img src={attached.thumbnail} alt={`Attached screen: ${attached.display}`} />
                <figcaption>{attached.display} — will be sent with your question.</figcaption>
              </figure>
            )}
            <button
              disabled={pending || screen.state.attaching || meetingId === null}
              onClick={() => void screen.attach()}
            >
              {screen.state.attaching ? 'Capturing…' : attached ? 'Replace' : 'Attach screen'}
            </button>
            {attached && (
              <button disabled={pending} onClick={() => void screen.remove()}>
                Remove
              </button>
            )}
          </div>
          <button
            disabled={busy || pending || !draft.trim() || screen.state.attaching}
            onClick={() => void submit()}
          >
            Send
          </button>
        </>
      )}
      {screen.state.error && <p role="alert">{screen.state.error}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
