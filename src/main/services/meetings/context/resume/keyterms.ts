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

/** Alternate sources, resume first, deduped case-insensitively, so a large job glossary
 * cannot starve meeting-specific names. Ordering only: the provider trims to its own
 * limits (see services/stt/keyterm-budget.ts). */
export function interleaveKeyterms(glossary: string[], resume: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < Math.max(glossary.length, resume.length); i++) {
    for (const raw of [resume[i], glossary[i]]) {
      const term = raw?.trim().replace(/\s+/g, ' ')
      if (!term || seen.has(term.toLowerCase())) continue
      seen.add(term.toLowerCase())
      result.push(term)
    }
  }
  return result
}
