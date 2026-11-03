import { getGlossaryTerms } from '../../../db/repos/jobs'
import { interleaveKeyterms, resumeKeyterms } from './resume/keyterms'

/** The recognition hints for one meeting, streaming or batch: the job glossary plus names
 *  pulled from the meeting's resume, most important first. The STT provider applies its
 *  own limits. */
export function meetingKeyterms(jobId: number, resumeText: string): string[] {
  return interleaveKeyterms(getGlossaryTerms(jobId), resumeKeyterms(resumeText))
}
