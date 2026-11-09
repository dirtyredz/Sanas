// Improvised-answer marker. The assistant wraps any phrase not backed by supplied facts or the
// transcript in ⟨ and ⟩. The overlay renders it dimmed; every other surface (clipboard, Markdown
// export, headline memory) strips it so the text degrades to plain, speakable prose.

export const FILLER_OPEN = '⟨'
export const FILLER_CLOSE = '⟩'

export interface FillerPart {
  text: string
  filler: boolean
}

const escapeRegExp = (text: string): string => text.replace(/[\\^$.*+?()[\]{}|-]/g, '\\$&')
const MARKER_PATTERN = new RegExp(`[${escapeRegExp(FILLER_OPEN + FILLER_CLOSE)}]`, 'g')

/** Plain text with the markers removed. Tolerates unbalanced or stray markers. */
export function stripFillerMarkers(text: string): string {
  return text.replace(MARKER_PATTERN, '')
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
