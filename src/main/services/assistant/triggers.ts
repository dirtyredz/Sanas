// Ambient trigger heuristics: decide when a final transcript segment warrants
// an unprompted nudge. Cheap local checks only — the expensive call happens
// after this gate. Expected to grow; keep it isolated here (STRUCTURE.md).

const INTERROGATIVE_START =
  /^(what|how|why|when|where|who|which|can|could|would|should|will|do|does|did|are|is|was|were|have|has|any thoughts|thoughts on)\b/i

const MIN_WORDS = 4
const DEBOUNCE_MS = 20_000

let lastFiredAt = 0

export function resetTriggers(): void {
  lastFiredAt = 0
}

/** Returns true when this final segment should fire an ambient nudge. */
export function shouldTrigger(seg: { isUser: boolean; text: string }): boolean {
  if (seg.isUser) return false // never nudge on the user's own speech
  const text = seg.text.trim()
  if (text.split(/\s+/).length < MIN_WORDS) return false

  const looksLikeQuestion = text.endsWith('?') || INTERROGATIVE_START.test(text)
  if (!looksLikeQuestion) return false

  const now = Date.now()
  if (now - lastFiredAt < DEBOUNCE_MS) return false
  lastFiredAt = now
  return true
}
