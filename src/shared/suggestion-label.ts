import type { SuggestionPurpose, SuggestionTrigger } from './types'

// One label vocabulary for suggestions, shared by the overlay, the meeting history and the
// Markdown export so a "Next point" never reads as a "Whisper" in one of them. Historical
// rows keep their labels: requested answers are "Answer", automatic answers "Whisper".

export interface LabelledSuggestion {
  manualKind?: 'typed' | 'detail' | 'audience' | null
  trigger: SuggestionTrigger
  purpose: SuggestionPurpose
}

/** The suggestion's name: "Next point" | "Answer" | "Whisper". */
export function suggestionLabel(s: LabelledSuggestion): string {
  if (s.manualKind)
    return { typed: 'Typed answer', detail: 'More detail', audience: 'Ask the audience' }[
      s.manualKind
    ]
  if (s.purpose === 'next-point') return 'Next point'
  return s.trigger === 'hotkey' ? 'Answer' : 'Whisper'
}

/** Where it came from, for the meeting history: "you asked" | "while you talked" | "ambient". */
export function suggestionOrigin(s: LabelledSuggestion): string {
  if (s.purpose === 'next-point') return 'while you talked'
  return s.trigger === 'hotkey' ? 'you asked' : 'ambient'
}

/** The overlay's unread-arrival notice for a suggestion the reader has not opened yet. */
export function suggestionArrivalLabel(s: LabelledSuggestion): string {
  return s.purpose === 'next-point' ? 'New next point' : 'New answer'
}
