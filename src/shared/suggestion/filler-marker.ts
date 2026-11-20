// Improvised-answer marker. The assistant wraps any phrase not backed by supplied facts or the
// transcript in ⟨ and ⟩.
//
// Surfaces that KEEP the markers (to style filler): the overlay and the meeting-history
// suggestion view, via splitFiller / FillerText, and the persisted Suggestion.text itself.
// Surfaces that STRIP them, always through suggestionPlainText: the Markdown export and the
// shown-headline / told-story memory fed back into prompts. Any new surface that shows,
// copies, exports or summarizes suggestion text without filler styling must use it.

export const FILLER_OPEN = '⟨'
export const FILLER_CLOSE = '⟩'

export interface FillerPart {
  text: string
  filler: boolean
}

const escapeRegExp = (text: string): string => text.replace(/[\\^$.*+?()[\]{}|-]/g, '\\$&')
const MARKER_PATTERN = new RegExp(`[${escapeRegExp(FILLER_OPEN + FILLER_CLOSE)}]`, 'g')

/** A suggestion's text as plain, speakable prose: markers removed, tolerating unbalanced or
 *  stray ones. The single accessor for every surface that does not render filler styling. */
export function suggestionPlainText(s: { text: string }): string {
  return s.text.replace(MARKER_PATTERN, '')
}

/** Splits text into plain and filler runs. An unclosed marker (a streaming prefix) makes the
 *  rest filler; a stray closer is ignored; empty runs are dropped. */
export function splitFiller(text: string): FillerPart[] {
  const parts: FillerPart[] = []
  let filler = false
  let run = ''
  const flush = (): void => {
    if (run) parts.push({ text: run, filler })
    run = ''
  }
  for (const ch of text) {
    if (ch === FILLER_OPEN) {
      flush()
      filler = true
    } else if (ch === FILLER_CLOSE) {
      flush()
      filler = false
    } else run += ch
  }
  flush()
  return parts
}
