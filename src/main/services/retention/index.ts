import { statSync } from 'fs'
import type { RetentionPreview } from '@shared/types'
import { loadSettings } from '../../config/settings'
import { clearMeetingAudioPath, listMeetingsEndedBefore } from '../../db/repos/meetings'
import { removeAudioFile, removeMeeting } from '../meetings/remove'

// Age-based clean-up of what a meeting leaves behind. Audio files are the bulky part
// (~115 MB per mono hour); transcripts and summaries are small — so the two have
// separate limits, each in days, 0 = keep forever. Live meetings (no ended_at) are
// never touched. Runs on a timer in main and on demand from Settings.

const RUN_EVERY_MS = 6 * 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 30 * 1000

/** SQLite's datetime('now') text ("YYYY-MM-DD HH:MM:SS", UTC), so string compare works. */
function cutoff(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19).replace('T', ' ')
}

function fileSize(path: string | null): number {
  try {
    return path ? statSync(path).size : 0
  } catch {
    return 0
  }
}

/** Meetings past the whole-meeting limit, and meetings (not among those) whose audio
 *  is past the audio limit. */
function due(): {
  meetings: ReturnType<typeof listMeetingsEndedBefore>
  audio: ReturnType<typeof listMeetingsEndedBefore>
} {
  const { audioRetentionDays, meetingRetentionDays } = loadSettings()
  const meetings =
    meetingRetentionDays > 0 ? listMeetingsEndedBefore(cutoff(meetingRetentionDays)) : []
  const doomed = new Set(meetings.map((m) => m.id))
  const audio =
    audioRetentionDays > 0
      ? listMeetingsEndedBefore(cutoff(audioRetentionDays)).filter(
          (m) => m.audioPath !== null && !doomed.has(m.id),
        )
      : []
  return { meetings, audio }
}

/** What a run would remove right now. */
export function previewRetention(): RetentionPreview {
  const { meetings, audio } = due()
  return {
    meetings: meetings.length,
    audioFiles: audio.filter((m) => fileSize(m.audioPath) > 0).length,
    audioBytes: [...audio, ...meetings].reduce((t, m) => t + fileSize(m.audioPath), 0),
  }
}

/** Removes everything past its limit; resolves with what was removed. */
export function runRetention(): RetentionPreview {
  const removed = previewRetention()
  const { meetings, audio } = due()
  for (const m of audio) {
    if (removeAudioFile(m.audioPath)) clearMeetingAudioPath(m.id) // keep the pointer if it failed
  }
  for (const m of meetings) removeMeeting(m.id)
  if (removed.meetings > 0 || removed.audioFiles > 0) {
    console.log(
      `[sanas] retention: removed ${removed.meetings} meeting(s), ${removed.audioFiles} audio file(s)`,
    )
  }
  return removed
}

let timer: ReturnType<typeof setInterval> | null = null

/** Runs shortly after launch and every few hours after that. */
export function scheduleRetention(): void {
  if (timer) return
  setTimeout(() => runRetention(), FIRST_RUN_DELAY_MS)
  timer = setInterval(() => runRetention(), RUN_EVERY_MS)
}
