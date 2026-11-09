// The focus block of an AUTOMATIC answer: the completed turn it responds to, plus any
// questions carried over from before it (meetings/assist/automatic/question-ledger.ts).
//
// One neutral wording for every accepted verdict (question / request / objection, put to Me or
// to the room). The prompt is built BEFORE the classifier has spoken, so a speculative answer
// can start at once, and rebuilt after acceptance through the same builder: when nothing else
// changed it is the same prompt and the speculation is published (DECISIONS 2026-11-05). So it
// never states the classifier's kind or addressee; the model infers from the turn whether it
// was put to Me or opened to the room, and the room rule stays conditional.
//
// The one exception is the owner's "Answer every question": a turn put to ANOTHER participant
// gets an explicit reference-answer instruction. That prompt differs, so such a speculation is
// never published and the ordinary path answers it.

import { NO_SUGGESTION } from '@shared/live-controls/readable-suggestion'
import { boundedExcerpt } from '../prompts/excerpt'
import { ANCHOR_REMINDER, QUESTION_CHARS } from './anchor'

const EARLIER_QUESTION_CHARS = 600 // each carried-forward question

/** The completed turn an automatic answer responds to, so generation answers THAT turn
 *  rather than whichever line happens to be the latest in the window. */
export interface TriggeringTurn {
  /** Display label of the speaker ("Sarah", "S2", "?"). */
  speaker: string
  text: string
  /** Put to another participant, answered only because the owner enabled answering every
   *  question: the answer is for the owner's reference. Absent: the neutral automatic prompt. */
  reference?: boolean
  /** Earlier questions overtaken before any suggestion covered them, oldest first. The
   *  suggestion answers these and `text` together. */
  earlier?: readonly { speaker: string; text: string }[]
  /** Audio time the exchange began (the first question's first word). Splits the window into
   *  the current exchange and background; without it the rolling window is sent. */
  startMs?: number
}

/** What to do with the turn, whatever the classifier called it. */
const RESPONSE = `If it asks for information or an opinion, answer it; if it asks Me to explain,
demonstrate, decide or act, respond to that request; if it challenges something, reply to the
objection.`

/** Conditional, because the prompt does not know the addressee: a turn put to Me always gets
 *  an answer, an open floor only a useful contribution. */
const OPEN_FLOOR = `If it was put to the group as an open floor (such as "any questions?") rather than to Me, only
suggest something if there is a genuinely useful, non-repeated contribution or question for Me
to raise; otherwise output exactly ${NO_SUGGESTION}.`

const REFERENCE =
  'It was put to another participant. The owner has enabled answering every question; provide an answer for the owner’s reference.'

export function automaticTurnBlock(turn: TriggeringTurn): string {
  const who = turn.reference ? REFERENCE : OPEN_FLOOR
  if (turn.earlier?.length) {
    const lines = [
      ...turn.earlier.map((e) => ({ ...e, text: boundedExcerpt(e.text, EARLIER_QUESTION_CHARS) })),
      { speaker: turn.speaker, text: boundedExcerpt(turn.text, QUESTION_CHARS) },
    ].map((q, i) => `${i + 1}. ${q.speaker}: ${q.text}`)
    return `Questions to answer (oldest first; the last is the newest):
${lines.join('\n')}
These were asked back to back and none has been answered yet. Address EACH one, briefly and in
order, in ONE suggestion the user can scan mid-conversation: one short labelled line or point
per question, no preamble. ${RESPONSE} ${who}`
  }
  return `Respond to this completed turn:
${turn.speaker}: ${boundedExcerpt(turn.text, QUESTION_CHARS)}
Answer THAT turn, about the topic being discussed now. ${RESPONSE} ${ANCHOR_REMINDER} ${who}`
}
