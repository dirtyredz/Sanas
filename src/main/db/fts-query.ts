// Free text → a safe FTS5 MATCH expression. Every token is quoted, so user input can
// never reach the FTS5 operator grammar (an unbalanced quote or a stray NEAR would be a
// syntax error); only the operators we add are interpreted.

const STOPWORDS = new Set(
  (
    'a an and are as at be but by did do does for from had has have how i if in is it its ' +
    'of on or our so that the their them there these they this to was we were what when ' +
    'where which who why will with you your about did'
  ).split(' '),
)

function tokens(text: string): string[] {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).map((t) => t.toLowerCase())
}

/** Search-as-you-type: every word must match, the last one as a prefix. */
export function ftsAllOf(text: string): string {
  const words = tokens(text)
  return words.map((w, i) => (i === words.length - 1 ? `"${w}"*` : `"${w}"`)).join(' ')
}

/** Question retrieval: any content word may match; bm25 ranks by how many do. Stopwords
 *  are dropped so "what did we decide about the credits" retrieves on decide + credits. */
export function ftsAnyOf(text: string): string {
  const words = tokens(text).filter((w) => w.length > 1 && !STOPWORDS.has(w))
  return [...new Set(words)].map((w) => `"${w}"`).join(' OR ')
}
