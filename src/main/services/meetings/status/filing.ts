import { moveMeetingToJob } from '../../../db/repos/meeting/meetings'
import { isLiveMeeting } from './live-meeting'
/** Filing under the same job changes nothing; filing under a different job drops the meeting's resume/profile snapshot (answers keep their saved grounding). Paused meetings remain live. */
export function fileMeeting(meetingId: number, jobId: number): void {
  if (isLiveMeeting(meetingId))
    throw new Error(
      'End this meeting before filing it under another job. Use Apply for live context corrections.',
    )
  moveMeetingToJob(meetingId, jobId)
}
