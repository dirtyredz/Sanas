export const rubrics = [
  'quadratic',
  'empty-array',
  'boundary',
  'sql-null',
  'set',
  'date',
  'owner',
  'budget',
  'risk',
  'review',
  'signoff',
  'notice',
  'start',
] as const
export type Rubric = (typeof rubrics)[number]

/** Bounded lexical rubrics, not an LLM judge. Correlation is checked separately. */
export function semanticMatch(rubric: Rubric, text: string): boolean {
  switch (rubric) {
    case 'quadratic':
      return /\bquadratic\b|\bO\s*\(\s*n\s*(?:²|\^\s*2|\*\*\s*2)\s*\)/i.test(text)
    case 'empty-array':
      return (
        /\bNaN\b/.test(text) &&
        /\b0\b/.test(text) &&
        /<(?![=<])/.test(text) &&
        /empty|\[\]/i.test(text)
      )
    case 'boundary':
      return /off.by.one|one (?:extra|too many)|past the end|out.of.bounds/i.test(text)
    case 'sql-null':
      return /\bis\s+null\b/i.test(text) && !/\bis\s+not\s+null\b/i.test(text)
    case 'set':
      return /\bset\b/i.test(text)
    case 'date':
      return /\bdate\b|delivery|deadline/i.test(text)
    case 'owner':
      return /\bowner\b|\bowns?\b|ownership/i.test(text)
    case 'budget':
      return /budget|funding/i.test(text)
    case 'risk':
      return /risk/i.test(text)
    case 'review':
      return /review/i.test(text)
    case 'signoff':
      return /sign.?off|approv(?:er|al)/i.test(text)
    case 'notice':
      return /notice/i.test(text)
    case 'start':
      return /start|availability|available/i.test(text)
  }
}

export { proseWords } from '../../services/meetings/assist/outcomes'
