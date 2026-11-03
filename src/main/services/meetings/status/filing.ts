import { moveMeetingToJob } from '../../../db/repos/meeting/meetings'
import { isLiveMeeting } from './live-meeting'
/** History filing never changes saved answer grounding. Paused meetings remain live. */
export function fileMeeting(meetingId: number, jobId: number): void {
  if (isLiveMeeting(meetingId))
    throw new Error(
      'End this meeting before filing it under another job. Use Apply for live context corrections.',
    )
  moveMeetingToJob(meetingId, jobId)
}
