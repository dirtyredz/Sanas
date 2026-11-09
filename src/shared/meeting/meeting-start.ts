/** What the Live page may choose when a meeting starts, sent as one named options object.
 *  `interview` undefined lets main decide (on when the job has a saved resume);
 *  `meetingContext` is saved as the meeting's revision-0 context in the creation
 *  transaction. Practice and grounding snapshots are main-only and never cross this IPC. */
export interface MeetingStartOptions {
  interview?: boolean
  meetingContext?: string
}

/** The one rule for whether the Interview profile applies to a meeting: Mock (`practice`)
 *  always; otherwise the explicit choice, defaulting to on when the job has a saved resume.
 *  Main (profile snapshot at Start) and the Live checkbox both use it so they cannot drift. */
export function interviewApplies(
  interview: boolean | undefined,
  hasResume: boolean,
  practice = false,
): boolean {
  return practice || (interview ?? hasResume)
}
