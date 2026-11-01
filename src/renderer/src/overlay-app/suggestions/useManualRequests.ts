import { useCallback, useEffect, useRef, useState } from 'react'
import type { SuggestionView } from '../../lib/suggestions/whisper-history'
import { findStored, manualRequest, sendManualRequest } from './manual-requests'

export interface ManualRequestsModel {
  pending: boolean
  notice: string
  request(kind: 'detail' | 'audience'): Promise<void>
}

/** Admission feedback for More detail and Ask the audience — one handler for every view. An
 *  accepted request selects its answer card; it never changes the workspace or focus. */
export function useManualRequests(
  meetingId: number | null,
  items: SuggestionView[],
  selected: SuggestionView | null,
  select: (suggestionId: number) => void,
): ManualRequestsModel {
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const meetingRef = useRef(meetingId)
  const itemsRef = useRef(items)
  meetingRef.current = meetingId
  itemsRef.current = items
  useEffect(() => {
    setNotice('')
    setPending(false)
  }, [meetingId])

  const request = useCallback(
    async (kind: 'detail' | 'audience'): Promise<void> => {
      if (meetingId === null || pending) return
      const body = manualRequest(kind, meetingId, selected)
      if (!body) return
      setPending(true)
      setNotice('')
      const outcome = await sendManualRequest(body, {
        send: (r) => window.sanas.assist.request(r),
        isCurrent: (id) => meetingRef.current === id,
      })
      if (outcome.type === 'stale') return
      setPending(false)
      if (outcome.type === 'refused') setNotice(outcome.message)
      else {
        // the answer usually arrives before the admission reply; select it when it has
        const child = findStored(itemsRef.current, outcome.storedSuggestionId)
        if (child) select(child.suggestionId)
      }
    },
    [meetingId, pending, selected, select],
  )
  return { pending, notice, request }
}
