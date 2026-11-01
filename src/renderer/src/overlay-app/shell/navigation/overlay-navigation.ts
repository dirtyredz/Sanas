// Pure overlay navigation: which workspace is showing and whether preferences are open.
// Navigation owns neither assistance nor capture state. Nothing but the owner's own action
// changes the workspace: no slide, context, transcript or answer event is an input here, and
// every meeting (with or without a deck) opens on Answer.

export const WORKSPACES = ['answer', 'ask', 'screen', 'slide', 'transcript', 'context'] as const
export type Workspace = (typeof WORKSPACES)[number]
export type SecondaryWorkspace = Exclude<Workspace, 'answer'>

export interface NavigationState {
  meetingId: number | null
  workspace: Workspace
  preferencesOpen: boolean
}

export type NavigationEvent =
  | { type: 'select'; workspace: Workspace }
  | { type: 'meeting'; meetingId: number | null }
  /** The Ask shortcut (or a cold-start Ask intent) arrived. */
  | { type: 'compose' }
  | { type: 'preferences'; open: boolean }
  | { type: 'escape' }

export function initialNavigation(meetingId: number | null): NavigationState {
  return { meetingId, workspace: 'answer', preferencesOpen: false }
}

export function navigationReducer(state: NavigationState, event: NavigationEvent): NavigationState {
  switch (event.type) {
    case 'select':
      return state.workspace === event.workspace && !state.preferencesOpen
        ? state
        : { ...state, workspace: event.workspace, preferencesOpen: false }
    case 'meeting':
      // a re-broadcast of the same meeting (pause, resume, hydration) keeps the owner's choice
      return event.meetingId === state.meetingId ? state : initialNavigation(event.meetingId)
    case 'compose':
      return { ...state, workspace: 'ask', preferencesOpen: false }
    case 'preferences':
      return state.preferencesOpen === event.open
        ? state
        : { ...state, preferencesOpen: event.open }
    case 'escape':
      // the innermost layer first: an open popover closes before the workspace changes
      return state.preferencesOpen
        ? { ...state, preferencesOpen: false }
        : { ...state, workspace: 'answer' }
  }
}

/** What Escape does besides the state change: restore the popover trigger's focus, or give
 *  keyboard focus back (main blurs the overlay; drafts are kept). */
export function escapeEffect(state: NavigationState): 'restore-trigger' | 'release-focus' {
  return state.preferencesOpen ? 'restore-trigger' : 'release-focus'
}
