// Ambient trigger heuristics for COMPLETED turns: a deliberately loose local prefilter that
// decides whether a finished non-user turn is worth asking the classifier about, plus the
// pure answer-cooldown decision. Cheap local checks only. False positives are fine here —
// the classifier (./classifier.ts) rejects them; false negatives are not, because nothing
// downstream can recover a question this gate drops. Kept isolated (STRUCTURE.md).

const INTERROGATIVE_START =
  /^(what|how|why|when|where|who|whom|whose|which|can|could|would|should|will|shall|may|might|do|does|did|are|is|was|were|have|has|had|any thoughts|thoughts on)\b/

/** Phrases that ask for a response wherever they sit in a clause. */
const ASKING_PHRASES: RegExp[] = [
  /\b(walk|talk) (me|us) through\b/,
  /\btell (me|us) about\b/,
  /\bexplain\b/,
  /\bshow (me|us)\b/,
  /\bhelp (me|us) understand\b/,
  /\b(i'm|i am) curious\b/,
  /\bi wonder\b/,
  /\bi was wondering\b/,
  /\bwould like to know\b/,
  /\b(any )?thoughts\b/,
  /\byour take\b/,
  /\b(what|how) about\b/,
  /\bi disagree\b/,
  /\b(i'm|i am) not convinced\b/,
  /\bthat (won't|will not|wouldn't) work\b/,
  /\bmy concern\b/,
  /\b(i'm|i am) concerned\b/,
  /\bbut what if\b/,
]

/** Conversational openers stripped before looking for a sentence-opening interrogative. */
const LEADING_FILLER =
  /^(?:(?:so|um+|uh+|er+|okay|ok|well|right|alright|all right|yeah|yes|and|hey|hmm+|oh|look|like|actually|sorry|anyway|now|you know|i mean)\b[\s,]*)+/

export function normalizeTurnText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Clauses: sentence ends, semicolons, colons, commas and spaced dashes. */
function clauses(text: string): string[] {
  return text
    .split(/[.!;:,]+|\s[-–—]+\s/)
    .map((c) => c.trim().replace(LEADING_FILLER, '').trim())
    .filter(Boolean)
}

/** True when a completed non-user turn might call for a response. Loose by design. */
export function looksLikeResponseCandidate(text: string): boolean {
  const normalized = normalizeTurnText(text)
  if (!normalized) return false
  if (normalized.includes('?')) return true
  if (ASKING_PHRASES.some((p) => p.test(normalized))) return true
  return clauses(normalized).some((c) => INTERROGATIVE_START.test(c))
}

/** Whether an automatic answer may start now. `lastAnswerAt` is when the previous one
 *  started (receipt time, ms), null when none has; a cooldown of 0 never blocks. */
export function answerCooldownAllows(
  lastAnswerAt: number | null,
  now: number,
  cooldownSec: number,
): boolean {
  if (lastAnswerAt === null || cooldownSec <= 0) return true
  return now - lastAnswerAt >= cooldownSec * 1000
}
