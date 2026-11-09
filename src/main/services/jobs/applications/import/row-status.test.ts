import { describe, expect, it } from 'vitest'
import { linkedStatus } from './row-status'

describe('linkedStatus', () => {
  const same = {
    linkRoot: 'C:/resumes',
    currentRoot: 'C:/resumes',
    linkHash: 'h1',
    linkFingerprint: 'f1',
    linkStage: 'interview' as const,
    archived: false,
    packHash: 'h1',
    packFingerprint: 'f1',
    packStage: 'interview' as const,
  }

  it('different root is source-mismatch', () =>
    expect(linkedStatus({ ...same, currentRoot: 'D:/other' })).toBe('source-mismatch'))

  it('closed and not archived is archive-available even with no other change', () =>
    expect(
      linkedStatus({ ...same, linkStage: 'closed', packStage: 'closed', archived: false }),
    ).toBe('archive-available'))

  it('closed, archived and unchanged is imported', () =>
    expect(
      linkedStatus({ ...same, linkStage: 'closed', packStage: 'closed', archived: true }),
    ).toBe('imported'))

  it('closed and archived is imported even when the pack changed, never refresh-available', () =>
    expect(
      linkedStatus({
        ...same,
        packStage: 'closed',
        packHash: 'h2',
        packFingerprint: 'f2',
        archived: true,
      }),
    ).toBe('imported'))

  it('changed hash with same fingerprint is refresh-available', () =>
    expect(linkedStatus({ ...same, packHash: 'h2' })).toBe('refresh-available'))

  it('same (reused) hash with a different fingerprint is refresh-available', () =>
    expect(linkedStatus({ ...same, packFingerprint: 'f2' })).toBe('refresh-available'))

  it('null hashes and equal fingerprints are imported', () =>
    expect(linkedStatus({ ...same, linkHash: null, packHash: null })).toBe('imported'))

  it('stage change interview to offer is refresh-available', () =>
    expect(linkedStatus({ ...same, packStage: 'offer' })).toBe('refresh-available'))

  it('unchanged is imported', () => expect(linkedStatus(same)).toBe('imported'))
})
