// Free text → a safe FTS5 MATCH expression. Every token is quoted, so user input can
// never reach the FTS5 operator grammar (an unbalanced quote or a stray NEAR would be a
// syntax error); only the operators we add are interpreted. The branded return type is
// what repos accept, so raw text cannot be passed to MATCH by mistake.

declare const ftsMatchBrand: unique symbol
/** An FTS5 MATCH expression built here — the only thing searchSegments will run. */
export type FtsMatch = string & { readonly [ftsMatchBrand]: true }

const STOPWORDS = new Set(
  (
    'a an and are as at be but by did do does for from had has have how i if in is it its ' +
    'of on or our so that the their them there these they this to was we were what when ' +
    'where which who why will with you your about'
  ).split(' '),
)

function tokens(text: string): string[] {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).map((t) => t.toLowerCase())
}

/** Search-as-you-type: every word must match, the last one as a prefix. */
export function ftsAllOf(text: string): FtsMatch {
  const words = tokens(text)
  return words.map((w, i) => (i === words.length - 1 ? `"${w}"*` : `"${w}"`)).join(' ') as FtsMatch
}

/** Question retrieval: any content word may match; bm25 ranks by how many do. Stopwords
 *  and one-letter words are dropped ("what did we decide about the credits" retrieves on
 *  decide + credits); numbers of any length stay ("phase 2" keeps the 2). */
export function ftsAnyOf(text: string): FtsMatch {
  const words = tokens(text).filter((w) => (w.length > 1 || /^\d+$/.test(w)) && !STOPWORDS.has(w))
  return [...new Set(words)].map((w) => `"${w}"`).join(' OR ') as FtsMatch
}
