import type { PresentationState, Slide, SlideEvent } from '@shared/presentation/types'

export class PresentationSession {
  private slides: Slide[] = []
  private meetingId: number | null = null
  private ordinal = 0
  private revision = 0

  constructor(
    private readonly persist: (id: number, event: SlideEvent) => void,
    private readonly publish: (state: PresentationState) => void,
    private readonly moved: (atMs: number) => void,
  ) {}

  begin(meetingId: number, slides: Slide[]): void {
    this.slides = slides.map((s) => ({ ...s }))
    this.meetingId = meetingId
    this.ordinal = 0
    this.revision = slides.length ? 1 : 0
    this.publish(this.state())
  }

  state(): PresentationState {
    const current = this.slides[this.ordinal]
    const next = this.slides[this.ordinal + 1]
    return {
      meetingId: this.meetingId,
      revision: this.revision,
      ordinal: this.ordinal,
      count: this.slides.length,
      current: current ? { ...current } : null,
      next: next ? { title: next.title, talkingPoint: next.talkingPoint } : null,
    }
  }

  move(meetingId: number, direction: 'prev' | 'next', atMs: number): PresentationState {
    if (meetingId !== this.meetingId) throw new Error('This meeting is no longer active.')
    const ordinal = this.ordinal + (direction === 'next' ? 1 : -1)
    if (ordinal < 0 || ordinal >= this.slides.length) return this.state()
    const event = { ordinal, revision: this.revision + 1, tMs: Math.round(atMs) }
    this.persist(meetingId, event)
    this.ordinal = ordinal
    this.revision = event.revision
    this.moved(event.tMs)
    const state = this.state()
    this.publish(state)
    return state
  }

  clear(): void {
    this.slides = []
    this.meetingId = null
    this.revision = 0
    this.ordinal = 0
    this.publish(this.state())
  }
}
