/** What a caller may choose when a meeting starts: the renderer-facing shape that flows
 *  IPC handler -> meetings service. Grounding is deliberately absent: main resolves the
 *  selected job's saved resume and the Interview profile itself (start-grounding.ts) and
 *  hands the repo a `MeetingCreateInput`. */
export interface StartRequest {
  interview?: boolean
  practice?: boolean
  usePresentationDeck?: boolean
}
