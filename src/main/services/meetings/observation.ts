import type { MeetingState, TranscriptEvent } from '@shared/types'
import type { SttSignal } from '../stt/types'
import type { IdentityRole } from '../turns/types'

export type MeetingObservation =
  | { kind: 'transcript'; value: TranscriptEvent; role: IdentityRole }
  | { kind: 'signal'; value: SttSignal }
  | { kind: 'state'; value: MeetingState }

const listeners = new Set<(event: MeetingObservation) => void>()
export function subscribeMeeting(listener: (event: MeetingObservation) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function observeMeeting(event: MeetingObservation): void {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
      /* observation cannot interrupt capture */
    }
  }
}
