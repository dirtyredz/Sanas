import { interviewApplies } from '@shared/meeting/meeting-start'
import { type StartRequest } from './start-request'

/** Only Start reads Settings (already validated by SETTINGS_SCHEMA). A saved job resume turns
 *  Interview on by default; an explicit false overrides it; Mock always applies. */
export function interviewProfileSnapshot(
  request: StartRequest,
  hasResume: boolean,
  profile: string,
): string {
  if (!interviewApplies(request.interview, hasResume, request.practice)) return ''
  return profile.replaceAll('\0', '').trim()
}
