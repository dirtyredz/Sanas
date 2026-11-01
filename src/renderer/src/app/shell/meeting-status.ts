import type { MeetingState } from '@shared/types'

export type MeetingTone = 'idle' | 'live' | 'paused' | 'error'

export interface MeetingStatusView {
  label: string
  tone: MeetingTone
  /** Longer explanation for the tooltip and screen readers. */
  detail: string
}

/** What the app header says about the meeting: one short label, a tone for the dot, and the
 *  detail behind it. Pure so the wording is tested once and reused. */
export function describeMeetingStatus(
  state: Pick<MeetingState, 'status' | 'error' | 'captureWarning'>,
): MeetingStatusView {
  switch (state.status) {
    case 'live':
      return {
        label: 'Listening',
        tone: 'live',
        detail: state.captureWarning ?? 'Capturing and transcribing this meeting.',
      }
    case 'paused':
      return {
        label: 'Paused',
        tone: 'paused',
        detail: state.error ?? 'The meeting is open; nothing is being captured.',
      }
    case 'error':
      return {
        label: 'Needs attention',
        tone: 'error',
        detail: state.error ?? 'Something stopped the meeting. Open Live for details.',
      }
    default:
      return { label: 'Not listening', tone: 'idle', detail: 'No meeting is running.' }
  }
}
