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

export interface MeetingContextDraftModel {
  draft: ContextDraft
  dispatch: React.Dispatch<ContextDraftEvent>
  unsaved: boolean
  conflict: boolean
  apply(): Promise<void>
  reload(): void
}

/** Binds one meeting's context draft (the Live page editor and the overlay's Context). Mount it
 *  keyed by meeting id: a new meeting starts a new draft, so an Apply that finishes late cannot
 *  touch the next meeting's text. */
export function useMeetingContextDraft(context: MeetingContext): MeetingContextDraftModel {
  const [draft, dispatch] = useReducer(contextDraftReducer, context, initialContextDraft)
  const apply = useCallback(async (): Promise<void> => {
    dispatch({ type: 'begin' })
    try {
      const result = await window.sanas.meetingContext.update(contextUpdate(draft))
      dispatch({ type: 'applied', context: result })
    } catch (e) {
      dispatch({ type: 'failed', message: String(e) })
    }
  }, [draft])
  const reload = useCallback(() => {
    dispatch({ type: 'reload', context })
  }, [context])
  return {
    draft,
    dispatch,
    unsaved: isUnsaved(draft),
    conflict: hasConflict(draft, context),
    apply,
    reload,
  }
}
