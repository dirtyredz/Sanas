// The cross-process definition of "a suggestion a person can read". Main stamps the first
// readable broadcast and the overlay acknowledges visibility from the same predicate, so
// the two sides can never disagree about what counts as shown.

/** What an automatic suggestion outputs when it has nothing new and useful to say. */
export const NO_SUGGESTION = '<none>'

/** True for the no-op output (and the older bare NONE, tolerated from the model). */
export function isNoSuggestion(text: string): boolean {
  const t = text.trim().toLowerCase()
  return t === '' || t === NO_SUGGESTION || /^\**none\**\.?$/.test(t)
}

/** True when broadcast text shows something a person can read: not the no-op, not only
 *  Markdown delimiters, filler markers or whitespace. */
export function hasReadableText(text: string): boolean {
  if (isNoSuggestion(text)) return false
  return /[\p{L}\p{N}]/u.test(text.replace(/<none>/gi, ''))
}
