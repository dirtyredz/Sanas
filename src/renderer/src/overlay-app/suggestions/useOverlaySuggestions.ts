import { useEffect, useRef } from 'react'
import { useMeetingContext } from '../../lib/meeting/useMeetingContext'
import {
  useSuggestionHistory,
  type WhisperReadingState,
} from '../../lib/suggestions/useSuggestionHistory'
import type { SuggestionView } from '../../lib/suggestions/whisper-history'
import { requestedAnswerInFlight } from './manual-requests'

export interface OverlaySuggestionsModel {
  items: SuggestionView[]
  selected: SuggestionView | null
  selectedIndex: number
  latest: SuggestionView | null
  /** A newer answer exists than the one being read. */
  hasNewAnswer: boolean
  /** A requested answer is streaming; ambient generation never sets this. */
  requestedInFlight: boolean
  /** The selected answer was grounded in an earlier revision of the meeting context. */
  earlierContext: boolean
  select(suggestionId: number): void
  scrollRef: React.RefObject<HTMLDivElement | null>
  onScroll(event: React.UIEvent<HTMLDivElement>): void
}

/** History selection and reading position for the overlay's answer surface. Mounted above
 *  the workspaces so switching views keeps the selected card and its scroll lock. */
export function useOverlaySuggestions(meetingId: number | null): OverlaySuggestionsModel {
  const readingRef = useRef<WhisperReadingState>({ scrolled: false })
  const scrollRef = useRef<HTMLDivElement>(null)
  const [history, select] = useSuggestionHistory(meetingId, readingRef)
  const { context } = useMeetingContext(meetingId)
  useEffect(() => {
    readingRef.current.scrolled = false
    scrollRef.current?.scrollTo({ top: 0 })
  }, [history.selectedId])
  const selectedIndex = history.items.findIndex((item) => item.suggestionId === history.selectedId)
  const selected = selectedIndex >= 0 ? history.items[selectedIndex] : null
  const latest = history.items.at(-1) ?? null
  return {
    items: history.items,
    selected,
    selectedIndex,
    latest,
    hasNewAnswer: latest !== null && latest.suggestionId !== history.selectedId,
    requestedInFlight: requestedAnswerInFlight(history.items),
    earlierContext:
      selected?.contextRevision != null && !!context && selected.contextRevision < context.revision,
    select,
    scrollRef,
    onScroll: (event) => {
      readingRef.current.scrolled = event.currentTarget.scrollTop > 4
    },
  }
}
