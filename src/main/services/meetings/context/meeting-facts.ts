import type { MeetingGrounding } from '../../../db/repos/meeting/meeting-grounding'
import { candidateFacts, interviewProfileFacts } from './candidate-data'

/** Candidate-facts prompt block for a meeting's grounding; empty when it has neither
 *  resume nor profile. */
export function meetingCandidateFacts(grounding: MeetingGrounding): string {
  return (
    candidateFacts(grounding.resume?.text ?? '') + interviewProfileFacts(grounding.interviewProfile)
  )
}
