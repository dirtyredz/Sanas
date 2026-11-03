// Deliberately deterministic: capitalized names, acronyms, mixed-case tech, and
// a small lowercase technology vocabulary. Not entity recognition or an LLM call.
const generic = new Set(
  (
    'I A An The And Or At In On To For With From As By Of My We ' +
    'Experience Education Skills Summary Professional Engineer Senior Software Developer ' +
    'Work Employment Responsibilities Projects Built Developed Led Managed Used Using'
  )
    .toLowerCase()
    .split(' '),
)
const technologies = new Set(
  'camunda java javascript typescript python docker kubernetes react angular node.js postgresql mysql redis kafka terraform aws azure gcp graphql git linux dotnet'.split(
    ' ',
  ),
)

export function resumeKeyterms(text: string): string[] {
  const words = text.match(/[\p{L}][\p{L}\p{N}]*(?:[.+#-][\p{L}\p{N}]+|[+#]+)*/gu) ?? []
  return [
    ...new Set(
      words.filter(
        (word) =>
          !generic.has(word.toLowerCase()) &&
          word.length > 1 &&
          (/\p{Lu}/u.test(word) || technologies.has(word.toLowerCase())),
      ),
    ),
  ]
}

/** Alternate sources so a large job glossary cannot starve meeting-specific names.
 * Deepgram allows 100 hints / 500 tokens. UTF-8 bytes + separators deliberately
 * overestimate token cost without depending on an undocumented provider tokenizer. */
export function mergeKeyterms(glossary: string[], resume: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  let budget = 500
  for (let i = 0; i < Math.max(glossary.length, resume.length); i++) {
    for (const raw of [resume[i], glossary[i]]) {
      if (!raw) continue
      const term = raw.trim().replace(/\s+/g, ' ')
      const key = term.toLowerCase()
      const cost = Buffer.byteLength(term, 'utf8') + 1
      if (
        !term ||
        term.length > 100 ||
        [...term].some((c) => c.charCodeAt(0) < 32) ||
        seen.has(key)
      )
        continue
      seen.add(key)
      if (cost > budget) continue
      result.push(term)
      budget -= cost
      if (result.length === 100) return result
    }
  }
  return result
}
