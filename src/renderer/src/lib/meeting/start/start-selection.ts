import { interviewApplies, type MeetingStartOptions } from '@shared/meeting/meeting-start'

/** The Interview checkbox: the user's explicit choice when there is one, else on when the
 *  selected job has a saved resume (Unsorted never has one). Start sends only the override,
 *  so an untouched box lets main decide from what is saved at that moment. */
export function interviewChecked(override: boolean | undefined, jobHasResume: boolean): boolean {
  return interviewApplies(override, jobHasResume)
}

/** What Live's Start sends: the Interview override (undefined lets main decide) and the
 *  Meeting context typed before Start, exactly as typed. Whitespace-only text counts as none,
 *  so it never creates context history (which would block a later merge). */
export function meetingStartOptions(
  interviewOverride: boolean | undefined,
  contextDraft: string,
): MeetingStartOptions {
  return {
    ...(interviewOverride === undefined ? {} : { interview: interviewOverride }),
    ...(contextDraft.trim() ? { meetingContext: contextDraft } : {}),
  }
}

/** The pre-Start context draft after a Start attempt: cleared only once the meeting is
 *  confirmed live (its text now lives with the meeting); a failed capture or Start keeps it. */
export function contextDraftAfterStart(draft: string, live: boolean): string {
  return live ? '' : draft
}
