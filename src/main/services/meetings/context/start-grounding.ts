import type { MeetingResume } from '@shared/meeting-resume'
import { getJobResume } from '../../../db/repos/job/job-resume'
import { interviewProfileSnapshot } from './profile'
import type { StartRequest } from './start-request'

export interface StartGrounding {
  resume: MeetingResume | null
  interviewProfile: string
}

/** What a new meeting snapshots, resolved synchronously inside serialized Start: the selected
 *  job's saved resume (none when no job was selected, i.e. Unsorted) and the Interview profile.
 *  It never resolves the bucket job, so it does not depend on call order; the caller files the
 *  meeting under `jobId ?? ensureDefaultJob()`. Live and Mock share this. */
export function resolveStartGrounding(
  jobId: number | undefined,
  request: StartRequest,
  savedProfile: string,
): StartGrounding {
  const resume = jobId === undefined ? null : getJobResume(jobId)
  return {
    resume,
    interviewProfile: interviewProfileSnapshot(request, resume !== null, savedProfile),
  }
}
