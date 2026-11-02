export interface RequestOutcome {
  id: number
  suggestionId?: number
  purpose: string
  manualKind?: string
  stepIds: string[]
  turnSpans: { startMs: number; endMs: number }[]
  atMs: number
  firstDeltaMs?: number
  firstVisibleMs?: number
  completedMs?: number
  deliveredMs?: number
  imageDigest?: string
  status: 'pending' | 'completed' | 'declined' | 'failed' | 'cancelled'
  pendingAtStop?: boolean
  answer: string
  proseWords?: number
  classifier?: string
}

/** Public report contains timing, IDs and counts; synthetic text stays in private profile. */
export function publicOutcome(r: RequestOutcome): Omit<RequestOutcome, 'answer'> {
  const { answer, ...safe } = r
  return {
    ...safe,
    proseWords: r.purpose === 'classifier' ? undefined : (r.proseWords ?? proseWords(answer)),
  }
}

export function proseWords(text: string): number {
  return text
    .replace(/```[^]*?```/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}
