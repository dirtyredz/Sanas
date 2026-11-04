// The overlay's output contract, shared by every live suggestion (answers and next points)
// so the safe renderer (renderer/src/lib/suggestions/CompactSuggestion.tsx) always sees the same subset:
// one bold headline, optionally one short fenced code block, at most two short lines.
//
// Plus the two anti-repetition pieces every AUTOMATIC suggestion shares: the defined no-op
// output (an automatic suggestion may decline to say anything) and the list of headlines
// already shown this meeting, which the model must not repeat or re-assert.

import { FILLER_CLOSE, FILLER_OPEN, stripFillerMarkers } from '@shared/filler-marker'

export const INITIAL_ANSWER_DEPTH = `Initial answer depth (ambient and Answer now): infer the current ask's purpose from the transcript and explicit meeting context. For screening, factual experience verification, rate or availability checks, lead with one speakable sentence built on supplied facts, plausible and hedged where facts are missing, and at most one necessary qualifier; target 15-40 words, and never more than 40 words in total for factual or inventory checks ("level of experience with X", "what services have you used", "have you used X"): one speakable sentence plus at most one short line, no project narrative. Behavioural stories are not screening checks: open experience asks may use the 80-word compact target with a concrete speakable lead and up to two supporting lines. Technical nouns alone do not call for a design explanation. Include code only when implementation/code is requested or an exact artifact is essential to answer the ask. Only an ask whose subject is missing or garbled needs a short clarification; a question that names its subject but trails off is answered from its words, never completed with invented ones. Token budgets are ceilings, not length targets; reserve expansion for More detail.`

export const COMPACT_CONTRACT = `Format for a small live-meeting overlay (follow exactly):
- Line 1 is one bold headline, written as **text**, at most about 20 words. It must contain
  the thing to say or the answer, not a label.
- Only when the ask requests implementation or requires an exact artifact, include ONE fenced code block after it. Keep it minimal, runnable, and at most
  25 lines. Give one runnable minimal replacement. Alternatives belong in prose or must be
  commented out; never redeclare the same binding in a runnable block.
- Optionally include at most 2 short follow-up lines after the headline or code.
- Target at most 80 prose words excluding code: a speakable lead and at most 2 compact
  supporting points. Reserve longer explanation for More detail.
- Improvised filler stays wrapped in ${FILLER_OPEN} ${FILLER_CLOSE} inside the headline and lines; it counts toward the limits.
- No headings, bullet walls, preamble, or praise such as "Great question".`

/** What an automatic suggestion outputs when it has nothing new and useful to say. */
export const NO_SUGGESTION = '<none>'

/** True for the no-op output (and the older bare NONE, tolerated from the model). */
export function isNoSuggestion(text: string): boolean {
  const t = text.trim().toLowerCase()
  return t === '' || t === NO_SUGGESTION || /^\**none\**\.?$/.test(t)
}

/** While streaming: could this prefix still turn out to be the no-op? If so, nothing is
 *  shown yet, so a declined suggestion never flashes on screen. */
export function couldBeNoSuggestion(prefix: string): boolean {
  const t = prefix.trim().toLowerCase()
  return NO_SUGGESTION.startsWith(t) || 'none'.startsWith(t.replace(/^\*+/, ''))
}

const HEADLINE_CHARS = 200
/** How many shown headlines an automatic prompt carries — and so how many are kept. */
const RECENT_SUGGESTIONS = 3

/** The headline of a compact suggestion: its first non-empty line, without bold markers. */
export function headlineOf(text: string): string {
  const line = text.split('\n').find((l) => l.trim()) ?? ''
  return stripFillerMarkers(line.replace(/\*\*/g, '')).trim().slice(0, HEADLINE_CHARS)
}

/** Records a shown suggestion's headline, keeping only as many as the prompt uses. */
export function rememberHeadline(headlines: string[], text: string): void {
  headlines.push(headlineOf(text))
  if (headlines.length > RECENT_SUGGESTIONS)
    headlines.splice(0, headlines.length - RECENT_SUGGESTIONS)
}

/** The "already shown" block for an automatic prompt. */
export function recentSuggestionsBlock(headlines: readonly string[]): string {
  const recent = headlines.slice(-RECENT_SUGGESTIONS).filter(Boolean)
  const list = recent.length > 0 ? recent.map((h) => `- ${h}`).join('\n') : '(none yet)'
  return `Suggestions already shown to Me this meeting (headlines, most recent last):
${list}
Do not repeat or re-assert these. If your best suggestion is essentially the same as one of
them, output exactly ${NO_SUGGESTION} and nothing else.`
}
