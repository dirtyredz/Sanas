import type { MeetingResume } from '@shared/meeting-resume'

/** What a caller may choose when a meeting starts: the renderer-facing shape that flows
 *  IPC handler -> meetings service. `resume` is already validated. The interview profile
 *  is deliberately absent: main resolves it from Settings and hands the repo a
 *  `MeetingCreateInput`. */
export interface StartRequest {
  interview?: boolean
  practice?: boolean
  usePresentationDeck?: boolean
  resume?: MeetingResume | null
}
