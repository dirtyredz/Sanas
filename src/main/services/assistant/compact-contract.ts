// The overlay's output contract, shared by every live suggestion (answers and next points)
// so the safe renderer (renderer/src/lib/suggestions/CompactSuggestion.tsx) always sees the same subset:
// one bold headline, optionally one short fenced code block, at most two short lines.
//
// Plus the two anti-repetition pieces every AUTOMATIC suggestion shares: the defined no-op
// output (an automatic suggestion may decline to say anything) and the list of headlines
// already shown this meeting, which the model must not repeat or re-assert.

export const COMPACT_CONTRACT = `Format for a small live-meeting overlay (follow exactly):
- Line 1 is one bold headline, written as **text**, at most about 20 words. It must contain
  the thing to say or the answer, not a label.
- Optionally include ONE fenced code block after it. Keep it minimal, runnable, and at most
  25 lines. No comments unless essential.
- Optionally include at most 2 short follow-up lines after the headline or code.
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
  return line.replace(/\*\*/g, '').trim().slice(0, HEADLINE_CHARS)
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
