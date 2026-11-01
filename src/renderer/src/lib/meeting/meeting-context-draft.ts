import type { ContextUpdate, MeetingContext } from '@shared/live-controls/types'
import type { Slide } from '@shared/presentation/types'

// The meeting-context draft shared by the main window's full editor and the overlay's
// text-only Context: what is unsaved, what Apply sends, and how a conflict or failure keeps
// the owner's text. Pure; useMeetingContextDraft binds it to React.

export interface ContextDraft {
  /** The saved context this draft started from (or was last reloaded/applied to). */
  base: MeetingContext
  text: string
  slides: Slide[]
  /** Presentation revision when the deck was first edited; Apply guards against moves since. */
  deckRevision: number | null
  /** Continue-from slide chosen in the full editor. */
  ordinal: number | null
  busy: boolean
  notice: string
}

export type ContextDraftEvent =
  | { type: 'text'; text: string }
  /** `pin` records the current presentation revision even if one is already recorded. */
  | { type: 'slides'; slides: Slide[]; presentationRevision: number; pin?: boolean }
  | { type: 'ordinal'; ordinal: number; presentationRevision: number }
  | { type: 'reload'; context: MeetingContext }
  | { type: 'begin' }
  | { type: 'applied'; context: MeetingContext }
  | { type: 'failed'; message: string }

export function initialContextDraft(context: MeetingContext): ContextDraft {
  return {
    base: context,
    text: context.text,
    slides: context.slides,
    deckRevision: null,
    ordinal: null,
    busy: false,
    notice: '',
  }
}

export function contextDraftReducer(state: ContextDraft, event: ContextDraftEvent): ContextDraft {
  switch (event.type) {
    case 'text':
      return { ...state, text: event.text }
    case 'slides':
      return {
        ...state,
        slides: event.slides,
        deckRevision:
          event.pin || state.deckRevision === null
            ? event.presentationRevision
            : state.deckRevision,
      }
    case 'ordinal':
      return { ...state, ordinal: event.ordinal, deckRevision: event.presentationRevision }
    case 'reload':
      return initialContextDraft(event.context)
    case 'begin':
      return { ...state, busy: true, notice: '' }
    case 'applied':
      return { ...initialContextDraft(event.context), notice: 'Applied to this meeting.' }
    case 'failed':
      // a refused Apply (conflict, validation) keeps every unsaved edit
      return { ...state, busy: false, notice: event.message }
  }
}

export function deckChanged(state: ContextDraft): boolean {
  return JSON.stringify(state.slides) !== JSON.stringify(state.base.slides)
}

export function isUnsaved(state: ContextDraft, includeDeck: boolean): boolean {
  return state.text !== state.base.text || (includeDeck && deckChanged(state))
}

/** Another window applied a newer revision since this draft's base. */
export function hasConflict(state: ContextDraft, latest: MeetingContext | null): boolean {
  return latest !== null && latest.revision !== state.base.revision
}

/** What Apply sends. Text-only never carries a deck, so it can never change the slides. */
export function contextUpdate(
  state: ContextDraft,
  options: { textOnly: boolean; presentationRevision: number; currentOrdinal: number },
): ContextUpdate {
  const update: ContextUpdate = {
    meetingId: state.base.meetingId,
    expectedRevision: state.base.revision,
    text: state.text,
  }
  if (options.textOnly || !deckChanged(state)) return update
  return {
    ...update,
    deck: {
      slides: state.slides,
      ordinal: selectedOrdinal(state, options.currentOrdinal),
      expectedPresentationRevision: state.deckRevision ?? options.presentationRevision,
    },
  }
}

/** The continue-from slide: the chosen one, else the live cursor, clamped to the draft deck. */
export function selectedOrdinal(state: ContextDraft, currentOrdinal: number): number {
  return Math.min(state.ordinal ?? currentOrdinal, Math.max(0, state.slides.length - 1))
}
