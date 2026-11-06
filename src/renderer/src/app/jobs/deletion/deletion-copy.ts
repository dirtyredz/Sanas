import type { JobDeletionCounts, JobDeletionResult } from '@shared/jobs/deletion'

// Wording for the counted job-deletion confirmation. Pure, so the exact sentences the owner
// confirms are tested.

export const RECORDINGS_NOT_BACKED_UP =
  'Recordings are not included in the database backup. Once deleted they cannot be recovered.'

const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/** One line per thing removed. The six the owner must always see are listed even at zero. */
export function deletionLines(counts: JobDeletionCounts): string[] {
  const lines = [
    plural(counts.meetings, 'meeting'),
    plural(counts.practiceSessions, 'practice session'),
    plural(counts.recordings, 'audio recording'),
    plural(counts.glossaryTerms, 'glossary term'),
    counts.resumes ? 'the saved resume' : 'no saved resume',
    counts.applicationLinks ? 'the resumes application link' : 'no application link',
  ]
  if (counts.transcriptSegments) lines.push(plural(counts.transcriptSegments, 'transcript line'))
  if (counts.summaries) lines.push(plural(counts.summaries, 'meeting summary', 'meeting summaries'))
  if (counts.suggestions) lines.push(plural(counts.suggestions, 'saved suggestion'))
  if (counts.legacySlides) lines.push(plural(counts.legacySlides, 'legacy slide'))
  return lines
}

/** What to tell the user after a delete attempt; `done` closes the dialog. */
export function deletionOutcome(result: JobDeletionResult): { done: boolean; text: string } {
  switch (result.status) {
    case 'deleted':
      return { done: true, text: `Deleted. Database backup: ${result.backupPath}` }
    case 'partial':
      return { done: false, text: `${result.message} Database backup: ${result.backupPath}` }
    default:
      return { done: false, text: result.message }
  }
}
