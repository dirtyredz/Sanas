import type { SuggestionEvent } from '@shared/types'

export interface SuggestionView {
  suggestionId: number
  meetingId: number
  trigger: 'ambient' | 'hotkey'
  text: string
  streaming: boolean
  error: string | null
  finishedAt: number | null
}

export interface WhisperHistoryState {
  meetingId: number | null
  items: SuggestionView[]
  selectedId: number | null
}

export type WhisperHistoryAction =
  | { type: 'meeting'; meetingId: number | null }
  | { type: 'event'; event: SuggestionEvent; followNewest: boolean; now: number }
  | { type: 'select'; suggestionId: number }

export const EMPTY_WHISPER_HISTORY: WhisperHistoryState = {
  meetingId: null,
  items: [],
  selectedId: null,
}

export interface ReadingState {
  scrolled: boolean
}

/** Ambient answers follow unless the owner deliberately left or scrolled the newest answer. */
export function shouldFollowNewAmbient(state: WhisperHistoryState, reading: ReadingState): boolean {
  if (state.items.length === 0) return true
  const latest = state.items[state.items.length - 1]
  if (state.selectedId !== latest.suggestionId) return false
  return !reading.scrolled
}

export function whisperHistoryReducer(
  state: WhisperHistoryState,
  action: WhisperHistoryAction,
): WhisperHistoryState {
  if (action.type === 'meeting') {
    return action.meetingId === state.meetingId
      ? state
      : { meetingId: action.meetingId, items: [], selectedId: null }
  }
  if (action.type === 'select') {
    return state.items.some((item) => item.suggestionId === action.suggestionId)
      ? { ...state, selectedId: action.suggestionId }
      : state
  }

  const { event, now } = action
  const base =
    state.meetingId === event.meetingId
      ? state
      : { meetingId: event.meetingId, items: [], selectedId: null }
  const index = base.items.findIndex((item) => item.suggestionId === event.suggestionId)
  const previous = index >= 0 ? base.items[index] : null
  const item: SuggestionView = {
    suggestionId: event.suggestionId,
    meetingId: event.meetingId,
    trigger: event.trigger,
    text:
      event.kind === 'done'
        ? event.text
        : event.kind === 'delta'
          ? (previous?.text ?? '') + event.text
          : (previous?.text ?? ''),
    streaming: event.kind === 'start' || event.kind === 'delta',
    error: event.kind === 'error' ? event.text : null,
    finishedAt: event.kind === 'done' || event.kind === 'error' ? now : null,
  }
  const items = [...base.items]
  if (index >= 0) items[index] = item
  else items.push(item)

  const isNew = index < 0
  const selectedId =
    base.selectedId === null || (isNew && (event.trigger === 'hotkey' || action.followNewest))
      ? event.suggestionId
      : base.selectedId
  return { ...base, items, selectedId }
}
