import { useCallback, useEffect, useReducer } from 'react'
import type { CaptureAttachResult, CaptureDraftView } from '@shared/live-controls/capture'

// The composer's screen attachment. Main owns the image; this only tracks the thumbnail and
// token main issued, so the composer can show, replace, remove and send it. The state lives for
// one meeting: it is mounted above the workspaces, so a reply for an earlier meeting is ignored.

export interface CaptureDraftState {
  meetingId: number | null
  draft: CaptureDraftView | null
  attaching: boolean
  error: string
}

export type CaptureDraftEvent =
  | { type: 'meeting'; meetingId: number | null }
  | { type: 'attaching'; meetingId: number }
  | { type: 'attached'; meetingId: number; result: CaptureAttachResult }
  | { type: 'failed'; meetingId: number; message: string }
  /** Removed by the owner, consumed by an accepted send, or refused as expired by main. */
  | { type: 'cleared'; error?: string }

export const EMPTY_CAPTURE_DRAFT: CaptureDraftState = {
  meetingId: null,
  draft: null,
  attaching: false,
  error: '',
}

export function captureDraftReducer(
  state: CaptureDraftState,
  event: CaptureDraftEvent,
): CaptureDraftState {
  if (event.type === 'meeting')
    return event.meetingId === state.meetingId
      ? state
      : { ...EMPTY_CAPTURE_DRAFT, meetingId: event.meetingId }
  if ('meetingId' in event && event.meetingId !== state.meetingId) return state
  switch (event.type) {
    case 'attaching':
      return { ...state, attaching: true, error: '' }
    case 'attached':
      // a failed replacement keeps the previous attachment (main kept it too)
      return event.result.ok
        ? { ...state, draft: event.result.draft, attaching: false, error: '' }
        : { ...state, attaching: false, error: event.result.message }
    case 'failed':
      return { ...state, attaching: false, error: event.message }
    case 'cleared':
      return { ...state, draft: null, attaching: false, error: event.error ?? '' }
  }
}

export interface CaptureDraft {
  state: CaptureDraftState
  attach(): Promise<void>
  remove(): Promise<void>
  cleared(error?: string): void
}

export function useCaptureDraft(meetingId: number | null): CaptureDraft {
  const [state, dispatch] = useReducer(captureDraftReducer, {
    ...EMPTY_CAPTURE_DRAFT,
    meetingId,
  })
  useEffect(() => dispatch({ type: 'meeting', meetingId }), [meetingId])
  const attach = useCallback(async (): Promise<void> => {
    if (meetingId === null) return
    dispatch({ type: 'attaching', meetingId })
    try {
      const result = await window.sanas.screenCapture.attach(meetingId)
      dispatch({ type: 'attached', meetingId, result })
    } catch (e) {
      dispatch({ type: 'failed', meetingId, message: String(e) })
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
