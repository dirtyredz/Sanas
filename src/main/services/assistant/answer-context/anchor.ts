// The anchor text of an answer prompt (DECISIONS 2026-11-04): which question is current and
// how the model is told to stay on it. prompts.ts composes these; the wording lives here.
// Which resume role to pick when a technology appears in several lives with the told
// stories (toldStoriesBlock), where the model sees the list it applies to.

import { boundedExcerpt } from '../excerpt'

/** The system-prompt anchor rule: the current question decides the topic; earlier
 *  conversation and earlier suggestions are background. */
export const CURRENT_QUESTION_RULE = `Answer the current question. The prompt marks the current exchange (the question being
answered and Me's reply so far); everything earlier is background. Answer the technology and
subject the current question names. Earlier turns are background: do not bring in a technology,
employer or project story from earlier in the conversation, or from an earlier suggestion,
unless the current question asks for it. If Me has already started answering, continue Me's
answer (same employer, project and technology) rather than swapping in a different resume
story; what Me has just said about this topic outranks a resume line that merely matches more
of its keywords. Statements Me made about an earlier topic are background, not commitments
for this one.

A question that refers back ("a service like that", "that one") means what the immediately
preceding exchange was about, not an older story.`

/** The short reminder printed under the question a prompt asks about. */
export const ANCHOR_REMINDER = `Answer the technology and subject THAT question names; earlier conversation is background. If
Me has already started answering, continue Me's answer rather than starting a different story.`

/** How much of the question being answered a prompt carries (opening + ending kept). */
export const QUESTION_CHARS = 4000

/** Answer now: the most recent other-speaker question, picked without a classifier. Also
 *  the shape a next point's "question Me is answering" is built from. */
export interface LatestQuestion {
  speaker: string
  text: string
  /** Audio time of its first word: where the current exchange starts. */
  startMs: number
  /** Still being spoken when Answer now was pressed: it may be cut off. */
  open: boolean
}

export function latestBlock(q: LatestQuestion): string {
  const cut = q.open
    ? ` It may still be cut off: answer what its words and the current exchange support, and do
not invent the rest of the question.`
    : ''
  return `The most recent question (Me asked for an answer to it now):
${q.speaker}: ${boundedExcerpt(q.text, QUESTION_CHARS)}
Answer THAT question. ${ANCHOR_REMINDER}${cut}`
}
