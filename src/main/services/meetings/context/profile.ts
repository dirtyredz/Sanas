import { type StartRequest } from './start-request'

/** Only Start reads Settings (already validated by SETTINGS_SCHEMA). Explicit false overrides
 *  the resume default; Mock always applies. */
export function interviewProfileSnapshot(request: StartRequest, profile: string): string {
  if (!(request.practice || (request.interview ?? !!request.resume))) return ''
  return profile.replaceAll('\0', '').trim()
}
