import type { MeetingState } from '@shared/types'

export interface MeetingStateSnapshot {
  state: MeetingState
  eventSeen: boolean
}

/** A broadcast observed while the initial read is in flight always wins over that read. */
export function mergeMeetingState(
  current: MeetingStateSnapshot,
  incoming: MeetingState,
  source: 'fetch' | 'event',
): MeetingStateSnapshot {
  if (source === 'fetch' && current.eventSeen) return current
  return { state: incoming, eventSeen: current.eventSeen || source === 'event' }
}

/**
 * Whether the on-screen clock counts. It stops the moment a Pause is requested (capture is
 * already closing) instead of waiting for main's `paused` confirmation, which arrives after
 * the WebSocket shutdown handshake. Display only: stored timestamps and the WAV are unaffected.
 */
export function clockRunning(status: MeetingState['status'], pausing: boolean): boolean {
  return status === 'live' && !pausing
}
