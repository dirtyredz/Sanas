import { existsSync, unlinkSync } from 'fs'
import { deleteMeeting, getMeeting } from '../../db/repos/meetings'
import { deleteSegmentsForMeeting } from '../../db/repos/segments'

// Deleting a meeting has two halves — the audio file on disk and the row (segments,
// suggestions and speaker names cascade from it). This is the one place both happen;
// the repo's deleteMeeting alone would leave the WAV behind (GOTCHAS.md).

export type RemoveOutcome = 'removed' | 'audio-locked' | 'missing'

/** Removes the meeting's recording and then the meeting itself. If the recording
 *  cannot be deleted (locked by another process) the row is kept as well, so its
 *  audio_path survives for a retry — a WAV without a row is an orphan nothing can find. */
export function removeMeeting(meetingId: number): RemoveOutcome {
  const meeting = getMeeting(meetingId)
  if (!meeting) return 'missing'
  if (!removeAudioFile(meeting.audioPath)) return 'audio-locked'
  deleteSegmentsForMeeting(meetingId) // row by row, so segments_fts stays in sync
  deleteMeeting(meetingId)
  return 'removed'
}

/** Best-effort unlink. Resolves true when the file is gone (deleted now, or already
 *  missing), false when it is still there — e.g. locked by another process. */
export function removeAudioFile(path: string | null): boolean {
  if (!path || !existsSync(path)) return true
  try {
    unlinkSync(path)
    return true
  } catch (e) {
    console.warn('[sanas] could not delete audio file', path, e)
    return false
  }
}
