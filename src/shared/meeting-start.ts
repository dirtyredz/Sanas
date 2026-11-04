/** What the Live page may choose when a meeting starts, sent as one named options object.
 *  `interview` undefined lets main decide (on when the job has a saved resume);
 *  `meetingContext` is saved as the meeting's revision-0 context in the creation
 *  transaction. Practice and grounding snapshots are main-only and never cross this IPC. */
export interface MeetingStartOptions {
  interview?: boolean
  meetingContext?: string
}
