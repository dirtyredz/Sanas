import { useCallback, useReducer } from 'react'
import type { MeetingContext } from '@shared/live-controls/types'
import {
  contextDraftReducer,
  contextUpdate,
  hasConflict,
  initialContextDraft,
  isUnsaved,
  type ContextDraft,
  type ContextDraftEvent,
} from './meeting-context-draft'

/** Text-only drafts never carry a deck (the overlay); deck drafts also edit slides against the
 *  live presentation (the main window). */
export type ContextDraftMode =
  { mode: 'text' } | { mode: 'deck'; presentationRevision: number; currentOrdinal: number }

export interface MeetingContextDraftModel {
  draft: ContextDraft
  dispatch: React.Dispatch<ContextDraftEvent>
  unsaved: boolean
  conflict: boolean
  apply(): Promise<void>
  reload(): void
}

/** Binds one meeting's context draft. Mount it keyed by meeting id: a new meeting starts a new
 *  draft, so an Apply that finishes late cannot touch the next meeting's text. */
export function useMeetingContextDraft(
  context: MeetingContext,
  options: ContextDraftMode,
): MeetingContextDraftModel {
  const [draft, dispatch] = useReducer(contextDraftReducer, context, initialContextDraft)
  const textOnly = options.mode === 'text'
  const presentationRevision = options.mode === 'deck' ? options.presentationRevision : 0
  const currentOrdinal = options.mode === 'deck' ? options.currentOrdinal : 0
  const apply = useCallback(async (): Promise<void> => {
    dispatch({ type: 'begin' })
    try {
      const result = await window.sanas.meetingContext.update(
        contextUpdate(draft, { textOnly, presentationRevision, currentOrdinal }),
      )
      dispatch({ type: 'applied', context: result })
    } catch (e) {
      dispatch({ type: 'failed', message: String(e) })
    }
  }, [draft, textOnly, presentationRevision, currentOrdinal])
  const reload = useCallback(() => {
    dispatch({ type: 'reload', context })
  }, [context])
  return {
    draft,
    dispatch,
    unsaved: isUnsaved(draft, !textOnly),
    conflict: hasConflict(draft, context),
    apply,
    reload,
  }
}
