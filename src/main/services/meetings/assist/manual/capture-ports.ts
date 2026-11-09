import type { Admission, ManualRequest } from '@shared/live-controls/types'
import type { AssistInput } from './manual-requests'

/** What the screen-capture feature needs from the running meeting session. */
export interface CaptureSessionPort {
  /** True while no requested answer holds the hotkey lane. */
  canRequest(): boolean
  request(input: AssistInput): Admission
}

/** What live controls may call: send a typed question together with its attached screen. */
export interface TypedQuestionWithScreen {
  sendWithDraft(input: Extract<ManualRequest, { kind: 'typed' }>, token: string): Admission
}
