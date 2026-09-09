// The one owner of the snippet-marker protocol: main wraps each matched term in these two
// control characters (bound into FTS5's snippet()), the renderer turns them into <mark>,
// and anything showing a snippet as plain text strips them. Control characters cannot
// occur in transcribed speech, so they never collide with content.

export const MATCH_OPEN = '\u0001'
export const MATCH_CLOSE = '\u0002'

/** Plain text: markers removed. */
export function stripMatchMarkers(s: string): string {
  return s.replaceAll(MATCH_OPEN, '').replaceAll(MATCH_CLOSE, '')
}

/** Runs of text with a flag for the marked (matched) ones, in order. */
export function splitMatchMarkers(s: string): { text: string; marked: boolean }[] {
  const out: { text: string; marked: boolean }[] = []
  let i = 0
  while (i < s.length) {
    const open = s.indexOf(MATCH_OPEN, i)
    if (open < 0) {
      out.push({ text: s.slice(i), marked: false })
      break
    }
    if (open > i) out.push({ text: s.slice(i, open), marked: false })
    const close = s.indexOf(MATCH_CLOSE, open + 1)
    if (close < 0) {
      out.push({ text: s.slice(open + 1), marked: true })
      break
    }
    out.push({ text: s.slice(open + 1, close), marked: true })
    i = close + 1
  }
  return out.filter((p) => p.text.length > 0)
}
