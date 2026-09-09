import { useEffect, useState } from 'react'
import type { MeetingState } from '@shared/types'

/** Just the live/idle state — for chrome (the sidebar status) that needs no transcript. */
export function useMeetingState(): MeetingState {
  const [state, setState] = useState<MeetingState>({ meetingId: null, status: 'idle' })
  useEffect(() => window.sanas.meeting.onState(setState), [])
  return state
}
