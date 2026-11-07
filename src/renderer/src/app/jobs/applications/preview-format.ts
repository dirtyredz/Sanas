import type { ImportFieldKey, PreviewValue } from '@shared/jobs/applications'

// Display text for the typed preview values main returns: field labels and the flattening of
// glossary terms and the resume into the strings the preview shows and edits.

export const FIELD_LABELS: Record<ImportFieldKey, string> = {
  companyInfo: 'Company info',
  projectScope: 'Project scope',
  notes: 'Notes (verified facts)',
  talkingPoints: 'Talking points',
  persona: 'Persona / tone',
  glossary: 'Glossary',
  resume: 'Resume (candidate material, separate from Notes)',
}

/** One line per glossary term (`term — note` when it has a note); the resume as name, a
 *  blank line and its text; text as is. A missing value reads as empty. */
export function formatPreviewValue(value: PreviewValue | null): string {
  if (!value) return ''
  switch (value.kind) {
    case 'text':
      return value.text
    case 'glossary':
      return value.terms.map((g) => (g.note ? `${g.term} — ${g.note}` : g.term)).join('\n')
    case 'resume':
      return value.resume ? `${value.resume.name}\n\n${value.resume.text}` : ''
  }
}
