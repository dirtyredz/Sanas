import { getMeetingInterviewProfile } from '../../../../db/repos/meeting-interview-profile'
import { interviewProfileFacts } from '../interview-profile/profile'
import { getMeetingResume } from '../../../../db/repos/meeting-resume'
import { candidateFacts } from './resume'

/** Candidate-facts prompt block for a saved meeting; empty when it has neither resume nor profile. */
export function meetingCandidateFacts(meetingId: number): string {
  return (
    candidateFacts(getMeetingResume(meetingId)?.text ?? '') +
    interviewProfileFacts(getMeetingInterviewProfile(meetingId))
  )
}
