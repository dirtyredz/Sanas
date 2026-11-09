import type { GlossaryTerm } from '@shared/types'
export function contextSize(
  notes: string,
  memory: string,
  glossary: GlossaryTerm[],
): { chars: number; tokens: number; large: boolean } {
  const chars =
    notes.length +
    memory.length +
    glossary.map((t) => `- ${t.term}${t.note ? `: ${t.note}` : ''}`).join('\n').length
  return { chars, tokens: Math.ceil(chars / 4), large: chars > 12_000 }
}
