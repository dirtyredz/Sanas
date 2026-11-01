import { useCallback, useEffect, useReducer, useRef } from 'react'
import { useCaptureDraft, type CaptureDraft } from '../../capture/useCaptureDraft'
import {
  EMPTY_COMPOSER,
  composerReducer,
  submitTypedQuestion,
  type ComposerState,
} from './composer-state'

export interface OverlayComposerModel {
  meetingId: number | null
  state: ComposerState
  screen: CaptureDraft
  /** A requested answer is already streaming or being admitted. */
  busy: boolean
  canSend: boolean
  edit(text: string): void
  submit(): Promise<void>
  inputRef: React.RefObject<HTMLTextAreaElement | null>
}

/** Owns the typed draft and its screen attachment for one meeting. Mounted above the
 *  workspaces, so switching views never resets it; a new meeting does. */
export function useOverlayComposer(meetingId: number | null, busy: boolean): OverlayComposerModel {
  const [state, dispatch] = useReducer(composerReducer, EMPTY_COMPOSER)
  const screen = useCaptureDraft(meetingId)
  const meetingRef = useRef(meetingId)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  meetingRef.current = meetingId
  useEffect(() => dispatch({ type: 'reset' }), [meetingId])

  const attached = screen.state.draft
  const canSend =
    meetingId !== null && !busy && !state.pending && !!state.draft.trim() && !screen.state.attaching
  const { cleared } = screen
  const submit = useCallback(async (): Promise<void> => {
    if (!canSend || meetingId === null) return
    dispatch({ type: 'begin' })
    const outcome = await submitTypedQuestion(
      { meetingId, text: state.draft, ...(attached ? { captureToken: attached.token } : {}) },
      {
        request: (request) => window.sanas.assist.request(request),
        isCurrent: (id) => meetingRef.current === id,
      },
    )
    if (outcome.type === 'stale') return
    if (outcome.type === 'failure') dispatch({ type: 'failure', message: outcome.message })
    else {
      dispatch({ type: 'result', result: outcome.result })
      if (outcome.clearAttachment) cleared()
    }
  }, [canSend, meetingId, state.draft, attached, cleared])

  const edit = useCallback((text: string) => dispatch({ type: 'edit', text }), [])
  return { meetingId, state, screen, busy, canSend, edit, submit, inputRef }
}
