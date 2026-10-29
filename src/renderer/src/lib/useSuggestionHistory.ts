import { useEffect, useReducer, useRef } from 'react'
import type { SuggestionEvent } from '@shared/types'
import {
  EMPTY_WHISPER_HISTORY,
  shouldFollowNewAmbient,
  whisperHistoryReducer,
  type WhisperHistoryState,
} from './whisper-history'

export interface WhisperReadingState {
  scrolled: boolean
}

export function useSuggestionHistory(
  meetingId: number | null,
  readingRef: React.RefObject<WhisperReadingState>,
): [WhisperHistoryState, (suggestionId: number) => void] {
  const [state, dispatch] = useReducer(whisperHistoryReducer, EMPTY_WHISPER_HISTORY)
  const stateRef = useRef(state)
  const meetingIdRef = useRef(meetingId)
  stateRef.current = state
  meetingIdRef.current = meetingId

  useEffect(() => dispatch({ type: 'meeting', meetingId }), [meetingId])
  useEffect(
    () =>
      window.sanas.assist.onSuggestion((event: SuggestionEvent) => {
        // A timed-out/slow answer may finish after Stop or after the next meeting starts.
        // It is still persisted by main, but it does not belong in this live meeting's list.
        if (event.meetingId !== meetingIdRef.current) return
        const now = Date.now()
        dispatch({
          type: 'event',
          event,
          followNewest:
            event.trigger === 'hotkey' ||
            shouldFollowNewAmbient(stateRef.current, readingRef.current),
          now,
        })
      }),
    [readingRef],
  )

  return [state, (suggestionId) => dispatch({ type: 'select', suggestionId })]
}
