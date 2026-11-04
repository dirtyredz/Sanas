import type { ContextUpdate, MeetingContext } from '@shared/live-controls/types'

// The meeting-context draft shared by the main window's Live editor and the overlay's
// Context: what is unsaved, what Apply sends, and how a conflict or failure keeps the
// owner's text. Pure; useMeetingContextDraft binds it to React.

export interface ContextDraft {
  /** The saved context this draft started from (or was last reloaded/applied to). */
  base: MeetingContext
  text: string
  busy: boolean
  notice: string
}

export type ContextDraftEvent =
  | { type: 'text'; text: string }
  | { type: 'reload'; context: MeetingContext }
  | { type: 'begin' }
  | { type: 'applied'; context: MeetingContext }
  | { type: 'failed'; message: string }

export function initialContextDraft(context: MeetingContext): ContextDraft {
  return { base: context, text: context.text, busy: false, notice: '' }
}

export function contextDraftReducer(state: ContextDraft, event: ContextDraftEvent): ContextDraft {
  switch (event.type) {
    case 'text':
      return { ...state, text: event.text }
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

export function isUnsaved(state: ContextDraft): boolean {
  return state.text !== state.base.text
}

/** Another window applied a newer revision since this draft's base. */
export function hasConflict(state: ContextDraft, latest: MeetingContext | null): boolean {
  return latest !== null && latest.revision !== state.base.revision
}

/** What Apply sends: the text, against the revision the draft started from. */
export function contextUpdate(state: ContextDraft): ContextUpdate {
  return {
    meetingId: state.base.meetingId,
    expectedRevision: state.base.revision,
    text: state.text,
  }
}
