// Historical presentation records. Presentation mode was retired on 2026-11-04
// (docs/DECISIONS.md): nothing writes slides any more, but meetings recorded before then
// keep their read-only slide markers in history, exports and regenerated summaries.

export interface Slide {
  title: string
  talkingPoint: string
  script: string
  keyFacts: string
}

export interface SlideEvent {
  deckVersion?: number
  revision: number
  ordinal: number | null
  tMs: number
}

export interface PresentationHistory {
  /** Every recorded deck version, keyed by version number. */
  versions: Record<number, Slide[]>
  events: SlideEvent[]
}
