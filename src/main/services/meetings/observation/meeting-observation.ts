import type { MeetingState, TranscriptEvent } from '@shared/types'
import type { SttSignal } from '../../stt/types'
import type { IdentityRole } from '../../turns/types'
import { createObserverBus } from './observer-bus'

export type MeetingObservation =
  | { kind: 'transcript'; value: TranscriptEvent; role: IdentityRole }
  | { kind: 'signal'; value: SttSignal }
  | { kind: 'state'; value: MeetingState }

const bus = createObserverBus<MeetingObservation>()
export const subscribeMeeting = bus.subscribe
export const observeMeeting = bus.publish
