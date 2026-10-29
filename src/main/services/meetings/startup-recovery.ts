import { closeMeetingsAt, listUnendedMeetingsExcept } from '../../db/repos/meetings'
import { liveMeetingId } from './live-meeting'
import { danglingMeetingEndedAt } from './startup-recovery-time'

/** Repairs meetings left open when the previous main process stopped unexpectedly. */
export function closeDanglingMeetingsAtStartup(): number {
  const closures = listUnendedMeetingsExcept(liveMeetingId()).map((meeting) => ({
    id: meeting.id,
    endedAt: danglingMeetingEndedAt(meeting.startedAt, meeting.lastSegmentEndMs),
  }))
  const closed = closeMeetingsAt(closures)
  console.log(`[sanas] closed ${closed} dangling meeting${closed === 1 ? '' : 's'} at startup`)
  return closed
}
