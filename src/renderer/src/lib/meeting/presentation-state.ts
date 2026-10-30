import type { PresentationState } from '@shared/presentation/types'

export const EMPTY_PRESENTATION: PresentationState = {
  meetingId: null,
  revision: 0,
  count: 0,
  ordinal: 0,
  current: null,
  next: null,
}

export function acceptPresentation(
  previous: PresentationState,
  incoming: PresentationState,
  meetingId: number | null,
): PresentationState {
  if (incoming.meetingId !== meetingId) return previous
  if (previous.meetingId === meetingId && incoming.revision < previous.revision) return previous
  return incoming
}
