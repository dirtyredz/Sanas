export interface ParsedGlossaryInput {
  terms: string[]
  alreadyThere: number
}

const SEPARATOR = /[\n,;\t·•]+/
const LEADING_BULLET = /^(?:[-*]\s+|\d+\.\s*)/

export function parseGlossaryInput(
  input: string,
  existingTerms: Iterable<string> = [],
): ParsedGlossaryInput {
  const seen = new Set(Array.from(existingTerms, (term) => term.trim().toLocaleLowerCase()))
  const terms: string[] = []
  let alreadyThere = 0

  for (const piece of input.split(SEPARATOR)) {
    const term = piece.trim().replace(LEADING_BULLET, '').trim()
    if (!term) continue

    const key = term.toLocaleLowerCase()
    if (seen.has(key)) {
      alreadyThere += 1
      continue
    }

    seen.add(key)
    terms.push(term)
  }

  return { terms, alreadyThere }
}
