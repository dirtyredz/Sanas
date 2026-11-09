// Deleting a job removes the job and everything recorded under it (owner decision
// 2026-11-06, docs/DECISIONS.md): its meetings (normal and practice) with their transcripts,
// summaries, suggestions, snapshots and practice results, their recordings on disk, and the
// job's glossary, saved resume, application link and legacy slides. Main counts first, the
// library confirms those exact counts, and main deletes only what it counted.

/** Everything a deletion would remove, counted across every dependent table. */
export interface JobDeletionCounts {
  /** Ordinary (non-practice) meetings. */
  meetings: number
  /** Mock-interview practice sessions (meetings with practice = 1). */
  practiceSessions: number
  transcriptSegments: number
  summaries: number
  suggestions: number
  /** Meetings whose recording path is set (the WAV files deleted from disk). */
  recordings: number
  glossaryTerms: number
  resumes: number
  applicationLinks: number
  legacySlides: number
  memories: number
  memoryProposals: number
}

/** Why a job cannot be deleted right now. */
export type JobDeletionBlock = 'missing' | 'protected' | 'live-meeting' | 'busy-meeting'

export interface JobDeletionPreview {
  jobId: number
  jobName: string
  counts: JobDeletionCounts
  /** Set when deletion is refused; `token` is then null. */
  blocked: { reason: JobDeletionBlock; message: string } | null
  /** Opaque, single-use, expiring confirmation bound to these exact counts. */
  token: string | null
}

export type JobDeletionResult =
  | { status: 'deleted'; backupPath: string; removed: JobDeletionCounts }
  /** The job or its history changed since the preview: count again and reconfirm. */
  | { status: 'stale'; message: string }
  | { status: 'blocked'; message: string }
  /** The database backup failed, so nothing was deleted. */
  | { status: 'backup-failed'; message: string }
  /** A meeting could not be removed; the job is kept. `removed` lists what is already gone. */
  | {
      status: 'partial'
      message: string
      backupPath: string
      removed: Pick<JobDeletionCounts, 'meetings' | 'practiceSessions' | 'recordings'>
    }
