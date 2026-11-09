import type { Meeting } from '@shared/types'

/** The one projection for reading a meeting row. The saved resume and interview profile
 *  (up to tens of KB each) are deliberately absent: they are reachable only through
 *  `getMeetingGrounding`. `interview_profile_used` is computed in SQL so the text never
 *  crosses into the row. `alias` is the meetings table alias in a join, e.g. `m`. */
export function meetingColumns(alias = ''): string {
  const p = alias ? `${alias}.` : ''
  return (
    [
      'id',
      'job_id',
      'title',
      'practice',
      'started_at',
      'ended_at',
      'audio_path',
      'summary',
      'action_items',
    ]
      .map((c) => `${p}${c}`)
      .join(', ') +
    `, trim(${p}interview_profile, ' ' || char(9, 10, 13)) != '' AS interview_profile_used`
  )
}

/** The row shape `meetingColumns` selects; keep the two in step. */
export interface MeetingRow {
  interview_profile_used: number
  practice: number
  id: number
  job_id: number
  title: string
  started_at: string
  ended_at: string | null
  audio_path: string | null
  summary: string | null
  action_items: string | null
}

export function toMeeting(r: MeetingRow): Meeting {
  return {
    id: r.id,
    jobId: r.job_id,
    practice: r.practice === 1,
    interviewProfileUsed: r.interview_profile_used === 1,
    title: r.title,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    audioPath: r.audio_path,
    summary: r.summary,
    actionItems: r.action_items,
  }
}
