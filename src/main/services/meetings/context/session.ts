import type { ContextUpdate, MeetingContext } from '@shared/live-controls/types'
import type { PresentationState, SlideEvent } from '@shared/presentation/types'

/** Pure preparation followed by commit, then publication. Failed persistence changes nothing. */
export function applyContext(
  current: MeetingContext,
  update: ContextUpdate,
  presentation: PresentationState,
  atMs: number,
  persist: (next: MeetingContext, atMs: number, event?: SlideEvent) => void,
  publish: (next: MeetingContext, event?: SlideEvent) => void,
): MeetingContext {
  if (current.meetingId !== update.meetingId || presentation.meetingId !== update.meetingId)
    throw new Error('This meeting is no longer active.')
  if (current.revision !== update.expectedRevision)
    throw new Error('Context changed. Reload before applying.')
  if (update.deck && update.deck.expectedPresentationRevision !== presentation.revision)
    throw new Error('Slide changed. Reload before applying.')
  if (
    update.deck &&
    (!Number.isSafeInteger(update.deck.ordinal) ||
      update.deck.ordinal < 0 ||
      update.deck.ordinal >= Math.max(1, update.deck.slides.length))
  )
    throw new Error('Selected slide is outside the deck.')
  const changedDeck =
    !!update.deck && JSON.stringify(update.deck.slides) !== JSON.stringify(current.slides)
  if (!changedDeck && current.text === update.text) return current
  const next: MeetingContext = {
    ...current,
    text: update.text,
    revision: current.revision + 1,
    deckVersion: current.deckVersion + (changedDeck ? 1 : 0),
    slides: changedDeck ? update.deck!.slides : current.slides,
  }
  const event: SlideEvent | undefined = changedDeck
    ? {
        revision: presentation.revision + 1,
        deckVersion: next.deckVersion,
        ordinal: next.slides.length ? update.deck!.ordinal : null,
        tMs: atMs,
      }
    : undefined
  persist(next, atMs, event)
  publish(next, event)
  return next
}
