import { existsSync, unlinkSync } from 'fs'
import { deleteMeeting, getMeeting } from '../../db/repos/meetings'
import { isLiveMeeting } from './live-meeting'
import { isPostProcessing } from './post-processing'

// Deleting a meeting has two halves — the audio file on disk and the row (segments,
// suggestions and speaker names cascade from it). This is the one place both happen;
// the repo's deleteMeeting alone would leave the WAV behind (GOTCHAS.md).

export type RemoveOutcome = 'removed' | 'live' | 'audio-locked' | 'busy' | 'missing'

/** Removes the meeting's recording and then the meeting itself. If the recording
 *  cannot be deleted (locked by another process) the row is kept as well, so its
 *  audio_path survives for a straightforward retry rather than becoming a file retention
 *  has to sweep by hand. */
export function removeMeeting(meetingId: number): RemoveOutcome {
  const meeting = getMeeting(meetingId)
  if (!meeting) return 'missing'
  // main is still writing to it: the next final would land on a deleted row
  if (isLiveMeeting(meetingId)) return 'live'
  // a summary, a re-diarization or an unfinished suggestion is still writing to it
  if (isPostProcessing(meetingId)) return 'busy'
  if (!removeAudioFile(meeting.audioPath)) return 'audio-locked'
  deleteMeeting(meetingId) // one statement: segments, names, suggestions and the FTS rows cascade
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
