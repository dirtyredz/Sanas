import { useCallback, useReducer } from 'react'
import type { CaptureAttachResult, CaptureDraftView } from '@shared/live-controls/capture'

// The composer's screen attachment. Main owns the image; this only tracks the thumbnail and
// token main issued, so the composer can show, replace, remove and send it.

export interface CaptureDraftState {
  draft: CaptureDraftView | null
  attaching: boolean
  error: string
}

export type CaptureDraftEvent =
  | { type: 'attaching' }
  | { type: 'attached'; result: CaptureAttachResult }
  | { type: 'failed'; message: string }
  /** Removed by the owner, consumed by an accepted send, or refused as expired by main. */
  | { type: 'cleared'; error?: string }

export const EMPTY_CAPTURE_DRAFT: CaptureDraftState = { draft: null, attaching: false, error: '' }

export function captureDraftReducer(
  state: CaptureDraftState,
  event: CaptureDraftEvent,
): CaptureDraftState {
  switch (event.type) {
    case 'attaching':
      return { ...state, attaching: true, error: '' }
    case 'attached':
      // a failed replacement keeps the previous attachment (main kept it too)
      return event.result.ok
        ? { draft: event.result.draft, attaching: false, error: '' }
        : { ...state, attaching: false, error: event.result.message }
    case 'failed':
      return { ...state, attaching: false, error: event.message }
    case 'cleared':
      return { draft: null, attaching: false, error: event.error ?? '' }
  }
}

export function useCaptureDraft(meetingId: number | null): {
  state: CaptureDraftState
  attach(): Promise<void>
  remove(): Promise<void>
  cleared(error?: string): void
} {
  const [state, dispatch] = useReducer(captureDraftReducer, EMPTY_CAPTURE_DRAFT)
  const attach = useCallback(async (): Promise<void> => {
    if (meetingId === null) return
    dispatch({ type: 'attaching' })
    try {
      dispatch({ type: 'attached', result: await window.sanas.screenCapture.attach(meetingId) })
    } catch (e) {
      dispatch({ type: 'failed', message: String(e) })
    }
  }, [meetingId])
  const remove = useCallback(async (): Promise<void> => {
    const draft = state.draft
    dispatch({ type: 'cleared' })
    if (draft)
      await window.sanas.screenCapture.discard(draft.meetingId, draft.token).catch(() => {})
  }, [state.draft])
  const cleared = useCallback((error?: string) => dispatch({ type: 'cleared', error }), [])
  return { state, attach, remove, cleared }
}
