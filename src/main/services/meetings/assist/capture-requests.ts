import type { Admission, ManualRequest } from '@shared/live-controls/types'
import type {
  CaptureAttachResult,
  CaptureDraftView,
  CaptureStatus,
} from '@shared/live-controls/capture'
import type { AcquiredCapture } from '../../screen-capture'
import type { CaptureDrafts } from './capture-drafts'
import type { AssistInput } from './manual-requests'

// Coordinates screen captures for the running meeting: Capture screen (capture → one
// requested answer) and the composer's Attach screen (capture → main-owned draft → sent with a
// typed question). Acquisition is slow and asynchronous, so it runs OUTSIDE the lifecycle
// queue (Pause and Stop never wait for it) and the result re-enters the queue to be admitted
// against the same meeting — a meeting that ended meanwhile simply discards it.
//
// Admission is deliberately simple (owner scope cut, docs/plans/screen-capture.md §8): a
// capture is refused as busy before acquisition when a requested answer is already running or
// another capture is still being prepared. A requested answer that starts while a capture is
// being prepared wins, and the capture then reports busy.

export type { AcquiredCapture }

export interface CaptureRequestDeps<Target> {
  serialize<T>(fn: () => Promise<T>): Promise<T>
  liveMeetingId(): number | null
  canRequest(): boolean
  apiKeySet(): boolean
  /** Picks the display synchronously, before the overlay is revealed. */
  target(): Target
  /** Captures and encodes the target display (bounded deadline). */
  acquire(target: Target): Promise<AcquiredCapture>
  request(input: AssistInput): Admission
  status(status: CaptureStatus): void
  drafts: CaptureDrafts
}

const BUSY = 'A requested answer is already running.'
const PREPARING = 'A screen capture is already in progress.'
const ENDED = 'This meeting is no longer active.'
const NO_MEETING = 'Start a meeting to capture the screen.'
const NO_KEY = 'No Anthropic API key set — add it in Settings.'
const EXPIRED = 'The attached screen is no longer available — attach it again or remove it.'

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export class CaptureRequests<Target> {
  private preparing = false
  private current: CaptureStatus = { meetingId: null, phase: 'idle', message: '', seq: 0 }

  constructor(private readonly deps: CaptureRequestDeps<Target>) {}

  /** The latest status, for an overlay that mounts after it was broadcast. */
  status(): CaptureStatus {
    return this.current
  }

  private setStatus(meetingId: number | null, phase: CaptureStatus['phase'], text = ''): void {
    this.current = { meetingId, phase, message: text, seq: this.current.seq + 1 }
    this.deps.status(this.current)
  }

  private refuse(
    meetingId: number | null,
    reason: 'busy' | 'unavailable',
    text: string,
  ): Admission {
    this.setStatus(meetingId, 'failed', text)
    return { accepted: false, reason, message: text }
  }

  /** Capture screen (button or shortcut). `meetingId` null means "the live meeting". */
  async capture(requested: number | null = null): Promise<Admission> {
    const meetingId = requested ?? this.deps.liveMeetingId()
    if (meetingId === null || meetingId !== this.deps.liveMeetingId())
      return this.refuse(meetingId, 'unavailable', requested === null ? NO_MEETING : ENDED)
    if (this.preparing) return this.refuse(meetingId, 'busy', PREPARING)
    if (!this.deps.canRequest()) return this.refuse(meetingId, 'busy', BUSY)
    if (!this.deps.apiKeySet()) return this.refuse(meetingId, 'unavailable', NO_KEY)
    this.preparing = true
    try {
      const target = this.deps.target()
      this.setStatus(meetingId, 'capturing', 'Capturing…')
      const captured = await this.deps.acquire(target)
      const result = await this.deps.serialize(async (): Promise<Admission> => {
        if (this.deps.liveMeetingId() !== meetingId)
          return { accepted: false, reason: 'unavailable', message: ENDED }
        return this.deps.request({ meetingId, kind: 'capture', image: captured.image })
      })
      if (result.accepted)
        this.setStatus(meetingId, 'analyzing', `Screen captured: ${captured.display} — analyzing…`)
      else if (this.deps.liveMeetingId() !== meetingId)
        this.setStatus(null, 'idle') // Stopped
      else this.setStatus(meetingId, 'failed', result.message)
      return result
    } catch (e) {
      return this.refuse(meetingId, 'unavailable', message(e))
    } finally {
      this.preparing = false
    }
  }

  /** Attach screen: capture into the meeting's composer draft, replacing any previous one.
   *  A failed replacement leaves the previous draft in place. */
  async attach(meetingId: number): Promise<CaptureAttachResult> {
    if (meetingId !== this.deps.liveMeetingId()) return { ok: false, message: ENDED }
    if (this.preparing) return { ok: false, message: PREPARING }
    this.preparing = true
    try {
      const captured = await this.deps.acquire(this.deps.target())
      return await this.deps.serialize(async (): Promise<CaptureAttachResult> => {
        if (this.deps.liveMeetingId() !== meetingId) return { ok: false, message: ENDED }
        const draft: CaptureDraftView = this.deps.drafts.put(meetingId, captured.image, {
          thumbnail: captured.thumbnail,
          display: captured.display,
          width: captured.width,
          height: captured.height,
        })
        return { ok: true, draft }
      })
    } catch (e) {
      return { ok: false, message: message(e) }
    } finally {
      this.preparing = false
    }
  }

  discard(meetingId: number, token: string): void {
    this.deps.drafts.discard(meetingId, token)
  }

  /** A typed question naming a composer draft. Called inside the lifecycle queue. The draft is
   *  consumed only when the answer is admitted; a stale token is refused, never sent as text. */
  sendWithDraft(input: Extract<ManualRequest, { kind: 'typed' }>, token: string): Admission {
    const draft = this.deps.drafts.get(input.meetingId, token)
    if (!draft) return { accepted: false, reason: 'attachment-expired', message: EXPIRED }
    if (this.preparing) return { accepted: false, reason: 'busy', message: PREPARING }
    const result = this.deps.request({
      meetingId: input.meetingId,
      kind: 'capture',
      text: input.text,
      image: draft.image,
    })
    if (result.accepted) this.deps.drafts.discard(input.meetingId, token)
    return result
  }

  /** The meeting ended or a new one began: drafts and stale feedback go. A capture still
   *  being prepared is discarded when it re-enters the queue. */
  meetingChanged(): void {
    this.deps.drafts.clear()
    if (this.current.phase !== 'idle') this.setStatus(null, 'idle')
  }

  /** The overlay renderer went away: nothing can send its drafts any more. */
  rendererGone(): void {
    this.deps.drafts.clear()
  }
}
