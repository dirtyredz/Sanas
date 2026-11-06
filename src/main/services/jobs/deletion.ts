import { app } from 'electron'
import type {
  JobDeletionBlock,
  JobDeletionCounts,
  JobDeletionPreview,
  JobDeletionResult,
} from '@shared/jobs/deletion'
import { getDb } from '../../db/index'
import { backupDatabase } from '../../db/backup'
import {
  deleteJobRow,
  isProtectedJob,
  jobDeletionSnapshot,
  type JobDeletionSnapshot,
} from '../../db/repos/job/job-deletion'
import { removeMeeting } from '../meetings/remove'
import { isLiveMeeting } from '../meetings/status/live-meeting'
import { isPostProcessing } from '../meetings/status/post-processing'
import { createPreviewTokens } from './preview-tokens'

// Deleting a job cascades to everything recorded under it (owner decision 2026-11-06):
// count → confirm those exact counts → back up the database → remove each meeting through
// meetings/remove.ts (row and recording) → delete the job row. The SQLite backup does not
// cover recordings and file deletion is not atomic, so a meeting that cannot be removed stops
// the run, keeps the job, and the result says what is already gone.

interface Pending {
  jobId: number
  fingerprint: string
}

const tokens = createPreviewTokens<Pending>()

const STALE = 'This job changed since you confirmed — review the counts again.'

function fingerprint(snapshot: JobDeletionSnapshot): string {
  return JSON.stringify(snapshot)
}

function blocked(
  snapshot: JobDeletionSnapshot,
): { reason: JobDeletionBlock; message: string } | null {
  const job = snapshot.job
  if (!job) return { reason: 'missing', message: 'This job no longer exists.' }
  if (isProtectedJob(job.id, job.name))
    return {
      reason: 'protected',
      message: 'Unsorted holds meetings started without a job, so it cannot be deleted.',
    }
  if (snapshot.meetings.some((m) => isLiveMeeting(m.id)))
    return {
      reason: 'live-meeting',
      message: 'A meeting for this job is still running or paused. Stop it first.',
    }
  if (snapshot.meetings.some((m) => isPostProcessing(m.id)))
    return {
      reason: 'busy-meeting',
      message: 'A meeting for this job is still being summarized or processed. Try again shortly.',
    }
  return null
}

/** Authoritative counts and, when deletion is allowed, a confirmation token for them. */
export function previewJobDeletion(jobId: number, senderId: number): JobDeletionPreview {
  const snapshot = jobDeletionSnapshot(jobId)
  const block = blocked(snapshot)
  return {
    jobId,
    jobName: snapshot.job?.name ?? '',
    counts: snapshot.counts,
    blocked: block,
    token: block ? null : tokens.issue(senderId, { jobId, fingerprint: fingerprint(snapshot) }),
  }
}

/** Deletes exactly what the confirmed preview counted, after a database backup. */
export async function deleteJob(token: string, senderId: number): Promise<JobDeletionResult> {
  const pending = tokens.take(token, senderId)
  if (!pending) return { status: 'stale', message: STALE }
  const before = jobDeletionSnapshot(pending.jobId)
  if (fingerprint(before) !== pending.fingerprint) return { status: 'stale', message: STALE }
  const refusal = blocked(before)
  if (refusal) return { status: 'blocked', message: refusal.message }

  let backupPath: string
  try {
    backupPath = await backupDatabase(getDb(), app.getPath('userData'), 'before-job-delete')
  } catch (e) {
    return {
      status: 'backup-failed',
      message:
        `The database backup failed, so nothing was deleted. ${e instanceof Error ? e.message : String(e)}`.slice(
          0,
          300,
        ),
    }
  }

  // Everything from here is synchronous: no meeting can start or finish in between.
  const now = jobDeletionSnapshot(pending.jobId)
  if (fingerprint(now) !== pending.fingerprint) return { status: 'stale', message: STALE }
  const lateRefusal = blocked(now)
  if (lateRefusal) return { status: 'blocked', message: lateRefusal.message }
  return removeAll(now, backupPath)
}

function removeAll(snapshot: JobDeletionSnapshot, backupPath: string): JobDeletionResult {
  const removed = { meetings: 0, practiceSessions: 0, recordings: 0 }
  for (const meeting of snapshot.meetings) {
    const outcome = removeMeeting(meeting.id)
    if (outcome !== 'removed' && outcome !== 'missing')
      return partial(removed, backupPath, MEETING_FAILURE[outcome])
    if (outcome === 'missing') continue
    if (meeting.practice) removed.practiceSessions++
    else removed.meetings++
    if (meeting.audioPath) removed.recordings++
  }
  try {
    deleteJobRow(snapshot.job!.id)
  } catch (e) {
    return partial(removed, backupPath, e instanceof Error ? e.message : String(e))
  }
  return { status: 'deleted', backupPath, removed: snapshot.counts satisfies JobDeletionCounts }
}

const MEETING_FAILURE = {
  live: 'A meeting started while deleting.',
  busy: 'A meeting is still being written to.',
  'audio-locked': 'A recording is in use by another program.',
} as const

function partial(
  removed: { meetings: number; practiceSessions: number; recordings: number },
  backupPath: string,
  why: string,
): JobDeletionResult {
  return {
    status: 'partial',
    backupPath,
    removed,
    message: `${why} The job was kept. Already deleted: ${removed.meetings} meeting(s), ${removed.practiceSessions} practice session(s), ${removed.recordings} recording(s). Try again to delete the rest.`,
  }
}
