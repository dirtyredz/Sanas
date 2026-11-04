import type { MeetingStartOptions } from '@shared/meeting-start'

/** What a caller may choose when a meeting starts: the renderer's validated Start options
 *  (`interview`, `meetingContext`) plus main-only `practice` (Mock interview). Grounding is
 *  deliberately absent: main resolves the selected job's saved resume and the Interview
 *  profile itself (start-grounding.ts) and hands the repo a `MeetingCreateInput`. */
export interface StartRequest extends MeetingStartOptions {
  practice?: boolean
}
