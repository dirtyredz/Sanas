import type { MeetingContext } from '@shared/live-controls/types'

export function newerContext(
  current: MeetingContext | null,
  incoming: MeetingContext,
  meetingId: number | null,
): MeetingContext | null {
  if (incoming.meetingId !== meetingId) return current
  return current?.meetingId === meetingId && current.revision > incoming.revision
    ? current
    : incoming
}
