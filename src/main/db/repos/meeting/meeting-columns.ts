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
