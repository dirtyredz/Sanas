// Deepgram's keyterm limits live here, behind the STT seam: callers hand the provider an
// ordered, deduped list (most important first) and the provider decides what fits.
const MAX_TERMS = 100
const MAX_TOKEN_BUDGET = 500
const MAX_TERM_LENGTH = 100

/** Trim to Deepgram's 100 hints / 500 tokens, keeping order. UTF-8 bytes + a separator
 *  deliberately overestimate token cost without depending on an undocumented tokenizer. */
export function fitKeyterms(terms: string[]): string[] {
  const result: string[] = []
  let budget = MAX_TOKEN_BUDGET
  for (const raw of terms) {
    const term = raw.trim().replace(/\s+/g, ' ')
    if (!term || term.length > MAX_TERM_LENGTH || [...term].some((c) => c.charCodeAt(0) < 32))
      continue
    const cost = Buffer.byteLength(term, 'utf8') + 1
    if (cost > budget) continue
    result.push(term)
    budget -= cost
    if (result.length === MAX_TERMS) break
  }
  return result
}
