import { expect, it } from 'vitest'
import type { JobDeletionCounts } from '@shared/jobs/deletion'
import { RECORDINGS_NOT_BACKED_UP, deletionLines, deletionOutcome } from './deletion-copy'

const zero: JobDeletionCounts = {
  meetings: 0,
  practiceSessions: 0,
  transcriptSegments: 0,
  summaries: 0,
  suggestions: 0,
  recordings: 0,
  glossaryTerms: 0,
  resumes: 0,
  applicationLinks: 0,
  memories: 0,
  memoryProposals: 0,
  legacySlides: 0,
}

it('always states the six counts the owner confirms, even at zero', () => {
  expect(deletionLines(zero)).toEqual([
    '0 meetings',
    '0 practice sessions',
    '0 audio recordings',
    '0 glossary terms',
    'no saved resume',
    'no application link',
  ])
})

it('states exact counts and adds history lines only when present', () => {
  expect(
    deletionLines({
      ...zero,
      meetings: 1,
      practiceSessions: 2,
      recordings: 1,
      glossaryTerms: 12,
      resumes: 1,
      applicationLinks: 1,
      transcriptSegments: 1_200,
      summaries: 1,
      suggestions: 3,
    }),
  ).toEqual([
    '1 meeting',
    '2 practice sessions',
    '1 audio recording',
    '12 glossary terms',
    'the saved resume',
    'the resumes application link',
    '1,200 transcript lines',
    '1 meeting summary',
    '3 saved suggestions',
  ])
  expect(RECORDINGS_NOT_BACKED_UP).toMatch(/not included in the database backup/)
})

it('closes only on success and reports partial progress with the backup', () => {
  expect(deletionOutcome({ status: 'deleted', backupPath: 'b.db', removed: zero })).toEqual({
    done: true,
    text: 'Deleted. Database backup: b.db',
  })
  const partial = deletionOutcome({
    status: 'partial',
    message: 'A recording is in use. The job was kept.',
    backupPath: 'b.db',
    removed: { meetings: 1, practiceSessions: 0, recordings: 1 },
  })
  expect(partial.done).toBe(false)
  expect(partial.text).toContain('The job was kept')
  for (const status of ['stale', 'blocked', 'backup-failed'] as const)
    expect(deletionOutcome({ status, message: 'why' })).toEqual({ done: false, text: 'why' })
})
