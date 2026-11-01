import type { Admission, ManualRequest } from '@shared/live-controls/types'
import type { SuggestionView } from '../../lib/suggestions/whisper-history'

// Pure policy for the overlay's explicit requests (More detail, Ask the audience): when they
// are offered, what they send, and what the owner sees afterwards.

/** More detail is offered on a finished, stored, grounded answer — never on a detail itself. */
export function canRequestDetail(s: SuggestionView | null): boolean {
  return (
    !!s?.storedSuggestionId &&
    !!s.groundingContextId &&
    s.purpose === 'answer' &&
    !s.streaming &&
    !s.error &&
    (!s.manualKind || s.manualKind === 'typed' || s.manualKind === 'capture')
  )
}

/** A requested (hotkey/manual) answer is streaming. Ambient generation never counts. */
export function requestedAnswerInFlight(items: SuggestionView[]): boolean {
  return items.some((item) => item.trigger === 'hotkey' && item.streaming)
}

export function findStored(
  items: SuggestionView[],
  storedSuggestionId: number | null | undefined,
): SuggestionView | undefined {
  if (storedSuggestionId == null) return undefined
  return items.find((item) => item.storedSuggestionId === storedSuggestionId)
}

export function manualRequest(
  kind: 'detail' | 'audience',
  meetingId: number,
  selected: SuggestionView | null,
): ManualRequest | null {
  if (kind === 'audience') return { meetingId, kind }
  if (!selected?.storedSuggestionId) return null
  return { meetingId, kind, sourceSuggestionId: selected.storedSuggestionId }
}

export type ManualOutcome =
  | { type: 'stale' }
  | { type: 'refused'; message: string }
  | { type: 'accepted'; storedSuggestionId?: number }

/** Sends one request; a reply after the meeting changed is stale and shows nothing. */
export async function sendManualRequest(
  request: ManualRequest,
  deps: {
    send: (request: ManualRequest) => Promise<Admission>
    isCurrent: (meetingId: number) => boolean
  },
): Promise<ManualOutcome> {
  try {
    const result = await deps.send(request)
    if (!deps.isCurrent(request.meetingId)) return { type: 'stale' }
    return result.accepted
      ? { type: 'accepted', storedSuggestionId: result.storedSuggestionId }
      : { type: 'refused', message: result.message }
  } catch (e) {
    return deps.isCurrent(request.meetingId)
      ? { type: 'refused', message: String(e) }
      : { type: 'stale' }
  }
}
