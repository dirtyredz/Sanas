import type { MeetingGrounding } from '../../../db/repos/meeting/meeting-grounding'
import { getGlossaryTerms } from '../../../db/repos/jobs'
import { interleaveKeyterms, resumeKeyterms } from './resume/keyterms'

/** The recognition hints for one meeting, streaming or batch: the job glossary plus names
 *  pulled from the meeting's immutable resume/profile, resume first within candidate hints. The STT provider applies its
 *  own limits. */
export function meetingKeyterms(
  jobId: number,
  grounding: Pick<MeetingGrounding, 'resume' | 'interviewProfile'>,
): string[] {
  return interleaveKeyterms(
    getGlossaryTerms(jobId),
    interleaveKeyterms(
      resumeKeyterms(grounding.interviewProfile),
      resumeKeyterms(grounding.resume?.text ?? ''),
    ),
  )
}
