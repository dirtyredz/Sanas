import { getMeetingResume } from '../../../../db/repos/meeting-resume'
import { candidateFacts } from './resume'

/** Candidate-facts prompt block for a saved meeting; empty when it has no resume. */
export function meetingCandidateFacts(meetingId: number): string {
  return candidateFacts(getMeetingResume(meetingId)?.text ?? '')
}
