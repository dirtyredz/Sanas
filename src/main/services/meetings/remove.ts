import { existsSync, unlinkSync } from 'fs'
import { deleteMeeting, getMeeting } from '../../db/repos/meetings'

// Deleting a meeting has two halves — the audio file on disk and the row (segments,
// suggestions and speaker names cascade from it). This is the one place both happen;
// the repo's deleteMeeting alone would leave the WAV behind (GOTCHAS.md).

/** Removes the meeting's recording and then the meeting itself. */
export function removeMeeting(meetingId: number): void {
  const meeting = getMeeting(meetingId)
  if (!meeting) return
  removeAudioFile(meeting.audioPath)
  deleteMeeting(meetingId)
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
