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
