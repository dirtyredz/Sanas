import type { MeetingResume } from '@shared/meeting-resume'
import { ensureDefaultJob } from '../../../db/repos/jobs'
import { getJobResume } from '../../../db/repos/job/job-resume'
import { interviewProfileSnapshot } from './profile'
import type { StartRequest } from './start-request'

export interface StartGrounding {
  job: number
  resume: MeetingResume | null
  interviewProfile: string
}

/** What a new meeting snapshots, resolved synchronously inside serialized Start: the selected
 *  job's saved resume and the Interview profile. With no job selected (Unsorted) the resume is
 *  resolved to none before the fallback bucket job is supplied. Live and Mock share this. */
export function resolveStartGrounding(
  jobId: number | undefined,
  request: StartRequest,
  savedProfile: string,
): StartGrounding {
  const resume = jobId === undefined ? null : getJobResume(jobId)
  return {
    job: jobId ?? ensureDefaultJob(),
    resume,
    interviewProfile: interviewProfileSnapshot(request, resume !== null, savedProfile),
  }
}
