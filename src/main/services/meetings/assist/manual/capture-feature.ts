import { IPC } from '@shared/ipc'
import type { Admission } from '@shared/live-controls/types'
import type { CaptureAttachResult, CaptureStatus } from '@shared/live-controls/capture'
import { loadSettings } from '../../../../config/settings'
import { broadcast } from '../../../../windows/broadcast'
import { overlayBounds } from '../../../../windows/overlay-window'
import { createScreenCapture } from '../../../screen-capture'
import { CaptureDrafts } from './capture-drafts'
import { CaptureRequests } from './capture-requests'
import type { CaptureSessionPort, TypedQuestionWithScreen } from './capture-ports'
import { assistReady } from '../suggestion/suggestion-requests'

interface CaptureFeatureDeps {
  serialize<T>(fn: () => Promise<T>): Promise<T>
  liveMeetingId(): number | null
  live: CaptureSessionPort
}

/** Screen-capture wiring for the running meeting: the display capture (overlay bounds),
 *  the composer draft store and the request coordinator, so the orchestrator knows none of
 *  them. `typedQuestions` is what `createLiveControls` needs to send a typed question with its
 *  attached screen. */
export function createCaptureFeature(deps: CaptureFeatureDeps): {
  typedQuestions: TypedQuestionWithScreen
  /** Capture screen (overlay button or shortcut). The display is chosen synchronously inside
   *  this call, so the shortcut calls it BEFORE revealing the overlay. */
  captureScreen(meetingId?: number | null): Promise<Admission>
  attachScreen(meetingId: number): Promise<CaptureAttachResult>
  discardScreen(meetingId: number, token: string): void
  captureStatus(): CaptureStatus
  screenRendererGone(): void
  /** The meeting began or ended: drafts and stale feedback belong to one meeting. */
  meetingChanged(): void
} {
  const screen = createScreenCapture(overlayBounds)
  const requests = new CaptureRequests({
    serialize: deps.serialize,
    liveMeetingId: deps.liveMeetingId,
    canRequest: () => deps.live.canRequest(),
    apiKeySet: () => assistReady(loadSettings()),
    target: screen.target,
    acquire: screen.acquire,
    request: (input) => deps.live.request(input),
    status: (status) => broadcast(IPC.ScreenCaptureStatus, status),
    drafts: new CaptureDrafts(),
  })
  return {
    typedQuestions: requests,
    captureScreen: (meetingId = null) => requests.capture(meetingId),
    attachScreen: (meetingId) => requests.attach(meetingId),
    discardScreen: (meetingId, token) => requests.discard(meetingId, token),
    captureStatus: () => requests.status(),
    screenRendererGone: () => requests.rendererGone(),
    meetingChanged: () => requests.meetingChanged(),
  }
}
