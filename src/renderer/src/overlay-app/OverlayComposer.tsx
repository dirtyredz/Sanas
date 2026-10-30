import type { Admission } from '@shared/live-controls/types'
import { useEffect, useRef, useReducer } from 'react'

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
    if (busy || pending || meetingId === null || !draft.trim()) return
    dispatch({ type: 'begin' })
    try {
      const result = await window.sanas.assist.request({ meetingId, kind: 'typed', text: draft })
      dispatch({ type: 'result', result })
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
          <button disabled={busy || pending || !draft.trim()} onClick={() => void submit()}>
            Send
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
