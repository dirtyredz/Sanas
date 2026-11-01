import { useEffect, useRef, useState } from 'react'
import type { MeetingState } from '@shared/types'
import { mergeMeetingState, type MeetingStateSnapshot } from './meeting-state'

/** Just the live/idle state — for chrome (the app header status) that needs no transcript. */
export function useMeetingState(): MeetingState {
  const initial: MeetingStateSnapshot = {
    state: { meetingId: null, status: 'idle' },
    eventSeen: false,
  }
  const snapshot = useRef(initial)
  const [state, setState] = useState<MeetingState>(initial.state)

  useEffect(() => {
    let mounted = true
    const apply = (incoming: MeetingState, source: 'fetch' | 'event'): void => {
      if (!mounted) return
      const next = mergeMeetingState(snapshot.current, incoming, source)
      snapshot.current = next
      setState(next.state)
    }
    // Subscribe first so a transition while the initial invoke is in flight cannot be missed.
    const off = window.sanas.meeting.onState((incoming) => apply(incoming, 'event'))
    void window.sanas.meeting.getState().then((incoming) => apply(incoming, 'fetch'))
    return () => {
      mounted = false
      off()
    }
  }, [])
  return state
}
