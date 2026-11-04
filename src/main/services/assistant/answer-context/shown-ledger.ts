// What the meeting has already been shown, kept in one place so production and the eval
// route a suggestion into the same memories. Two views, each with its own audience:
//   recent  headlines of every suggestion: what a next point (coach) must not repeat
//   told    stories the user may have said aloud: what an answer must not re-tell

import type { SuggestionPurpose } from '@shared/types'
import type { ManualKind } from '@shared/live-controls/types'
import { rememberHeadline } from '../compact-contract'
import { rememberStory, tellsStory, type ToldStory } from './told-stories'

export interface ShownSuggestion {
  text: string
  purpose: SuggestionPurpose
  manualKind?: ManualKind | null
}

export interface ShownSnapshot {
  recent: string[]
  told: ToldStory[]
}

export class ShownLedger {
  private readonly recent: string[] = []
  private readonly told: ToldStory[] = []

  /** Routes one shown suggestion into every memory it belongs to. */
  record(s: ShownSuggestion): void {
    rememberHeadline(this.recent, s.text)
    if (tellsStory(s.purpose, s.manualKind)) rememberStory(this.told, s.text)
  }

  /** Copies, so a request built from them cannot see later records. */
  snapshot(): ShownSnapshot {
    return { recent: [...this.recent], told: [...this.told] }
  }

  /** A new meeting. */
  reset(): void {
    this.recent.length = 0
    this.told.length = 0
  }
}
