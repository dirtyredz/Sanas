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

/** Binds one meeting's context draft. Mount it keyed by meeting id: a new meeting starts a new
 *  draft, so an Apply that finishes late cannot touch the next meeting's text. */
export function useMeetingContextDraft(
  saved: MeetingContext,
  latest: MeetingContext | null,
  options: { textOnly: boolean; presentationRevision: number; currentOrdinal: number },
): MeetingContextDraftModel {
  const [draft, dispatch] = useReducer(contextDraftReducer, saved, initialContextDraft)
  const { textOnly, presentationRevision, currentOrdinal } = options
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
    if (latest) dispatch({ type: 'reload', context: latest })
  }, [latest])
  return {
    draft,
    dispatch,
    unsaved: isUnsaved(draft, !textOnly),
    conflict: hasConflict(draft, latest),
    apply,
    reload,
  }
}
