import { isUnsortedJob } from '@shared/jobs/unsorted'
// Browser-preview mock for counted job deletion.
import type { MeetingResume } from '@shared/meeting-resume'
import type {
  JobDeletionCounts,
  JobDeletionPreview,
  JobDeletionResult,
} from '@shared/jobs/deletion'
import { mockMemoryCounts, removeMockMemory } from '../memory/mock-memory'
import { glossary, jobs, meetings, segments, suggestions } from '../mock-fixtures'

type SanasApi = Window['sanas']

const deletionTokens = new Map<string, { jobId: number; counts: JobDeletionCounts }>()

function removeFrom<T>(items: T[], match: (item: T) => boolean): void {
  for (let i = items.length - 1; i >= 0; i--) if (match(items[i])) items.splice(i, 1)
}

function countJobDeletion(
  jobId: number,
  jobResumes: Map<number, MeetingResume>,
): JobDeletionCounts {
  const own = meetings.filter((m) => m.jobId === jobId)
  const ids = new Set(own.map((m) => m.id))
  return {
    meetings: own.filter((m) => !m.practice).length,
    practiceSessions: own.filter((m) => m.practice).length,
    transcriptSegments: segments.filter((s) => ids.has(s.meetingId)).length,
    summaries: own.filter((m) => !!m.summary).length,
    suggestions: suggestions.filter((s) => ids.has(s.meetingId)).length,
    recordings: own.filter((m) => !!m.audioPath).length,
    glossaryTerms: glossary.filter((g) => g.jobId === jobId).length,
    resumes: jobResumes.has(jobId) ? 1 : 0,
    applicationLinks: jobs.find((j) => j.id === jobId)?.applicationId ? 1 : 0,
    ...mockMemoryCounts(jobId),
    legacySlides: 0,
  }
}

export function mockJobDeletion(
  jobResumes: Map<number, MeetingResume>,
): Pick<SanasApi['jobs'], 'deletePreview' | 'delete'> {
  return {
    deletePreview: async (jobId): Promise<JobDeletionPreview> => {
      const job = jobs.find((j) => j.id === jobId)
      const counts = countJobDeletion(jobId, jobResumes)
      if (!job) {
        return {
          jobId,
          jobName: '',
          counts,
          blocked: { reason: 'missing', message: 'That job no longer exists.' },
          token: null,
        }
      }
      if (job.id === 1 || isUnsortedJob(job)) {
        return {
          jobId,
          jobName: job.name,
          counts,
          blocked: {
            reason: 'protected',
            message: 'Unsorted holds meetings started without a job, so it cannot be deleted.',
          },
          token: null,
        }
      }
      const token = crypto.randomUUID()
      deletionTokens.set(token, { jobId, counts })
      return { jobId, jobName: job.name, counts, blocked: null, token }
    },
    delete: async (token): Promise<JobDeletionResult> => {
      const pending = deletionTokens.get(token)
      deletionTokens.delete(token)
      if (!pending) {
        return {
          status: 'stale',
          message: 'This job changed since you confirmed — review the counts again.',
        }
      }
      const { jobId, counts } = pending
      removeFrom(jobs, (j) => j.id === jobId)
      removeFrom(meetings, (m) => m.jobId === jobId)
      removeFrom(glossary, (g) => g.jobId === jobId)
      jobResumes.delete(jobId)
      removeMockMemory(jobId)
      return {
        status: 'deleted',
        backup: { fileName: 'before-job-delete-preview.db' },
        removed: counts,
      }
    },
  }
}
