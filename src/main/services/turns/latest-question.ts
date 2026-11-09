import type { OpenTurnView } from './turn-assembler'
import type { CompletedTurn } from './types'

// Which question an Answer now press (or a next point) is about, without a classifier: the
// most recent substantial turn by another voice. One still being spoken wins (the press often
// comes before the turn completes); otherwise the last completed one, while it is recent
// enough that nobody has plausibly moved on. Backchannel ("mm-hm", "right") never counts.

/** Answer now anchors on a completed question this recent (receipt time). Long enough for
 *  Me to have started answering and then asked for help continuing. */
export const ANSWER_NOW_QUESTION_MS = 90_000
/** A next point anchors on the question Me is answering for this long. */
export const COACH_QUESTION_MS = 300_000
/** Shorter other-speaker turns are backchannel, not a question. */
const MIN_QUESTION_WORDS = 3

export interface QuestionTurn {
  id: number
  channel: number
  speaker: number
  text: string
  startMs: number
  /** Still being spoken: it may be cut off. */
  open: boolean
}

function wordCount(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

/** True for a completed or open turn that could be the question Me is answering. */
export function couldBeQuestion(t: Pick<CompletedTurn, 'role' | 'text'>): boolean {
  return t.role !== 'user' && wordCount(t.text) >= MIN_QUESTION_WORDS
}

export function latestQuestion(
  lastCompleted: CompletedTurn | null,
  open: readonly OpenTurnView[],
  now: number,
  maxAgeMs: number,
): QuestionTurn | null {
  const speaking = open
    .filter((t) => couldBeQuestion(t) && (!lastCompleted || t.startMs >= lastCompleted.endMs))
    .sort((a, b) => b.startMs - a.startMs)[0]
  if (speaking)
    return {
      id: speaking.id,
      channel: speaking.channel,
      speaker: speaking.speaker,
      text: speaking.text,
      startMs: speaking.startMs,
      open: true,
    }
  if (!lastCompleted || now - lastCompleted.completedAt > maxAgeMs) return null
  return {
    id: lastCompleted.id,
    channel: lastCompleted.channel,
    speaker: lastCompleted.speaker,
    text: lastCompleted.text,
    startMs: lastCompleted.startMs,
    open: false,
  }
}
