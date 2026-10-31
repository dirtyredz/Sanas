import { randomUUID } from 'crypto'
import type { CaptureDraftView } from '@shared/live-controls/capture'
import type { AssistImage } from '../assistant/types'

// Composer attachments (Attach screen) held in main memory only: at most one per meeting,
// addressed by a main-issued token. Nothing is written to disk; dropping the draft drops the
// only copy of the image.

export interface CaptureDraft {
  view: CaptureDraftView
  image: AssistImage
}

export class CaptureDrafts {
  private readonly drafts = new Map<number, CaptureDraft>()

  constructor(private readonly newToken: () => string = randomUUID) {}

  /** Stores (or replaces) the meeting's draft and returns what the overlay may see. */
  put(
    meetingId: number,
    image: AssistImage,
    preview: Omit<CaptureDraftView, 'meetingId' | 'token'>,
  ): CaptureDraftView {
    const view: CaptureDraftView = { ...preview, meetingId, token: this.newToken() }
    this.drafts.set(meetingId, { view, image })
    return view
  }

  /** The draft only when the token is the meeting's current one. */
  get(meetingId: number, token: string): CaptureDraft | undefined {
    const draft = this.drafts.get(meetingId)
    return draft && draft.view.token === token ? draft : undefined
  }

  discard(meetingId: number, token: string): void {
    if (this.get(meetingId, token)) this.drafts.delete(meetingId)
  }

  clear(): void {
    this.drafts.clear()
  }

  get size(): number {
    return this.drafts.size
  }
}
