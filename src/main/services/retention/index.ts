import { statSync } from 'fs'
import { resolve } from 'path'
import type { Meeting, RetentionPreview, RetentionResult } from '@shared/types'
import { loadSettings } from '../../config/settings'
import {
  clearMeetingAudioPath,
  listAudioPaths,
  listMeetingsEndedBefore,
} from '../../db/repos/meetings'
import { listRecordings } from '../audio-store'
import { removeAudioFile, removeMeeting } from '../meetings/remove'

// Age-based clean-up of what a meeting leaves behind. Audio files are the bulky part
// (~115 MB per mono hour); transcripts and summaries are small — so the two have
// separate limits, each in days, 0 = keep forever. Live meetings (no ended_at) are
// never touched. Runs on a timer in main and on demand from Settings.
//
// It also sweeps ORPHANS — recordings on disk that no meeting POINTS AT. Deleting a
// meeting keeps its row until the file is gone, so orphans come from merges: those clear
// the survivor's audio_path and delete the other rows outright, so a file the merge could
// not unlink is left with nothing referring to it. Age cannot find them (there is no row
// to be old) and neither can a pointer, so the sweep works from the folder inwards.

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
function due(): { meetings: Meeting[]; audio: Meeting[] } {
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
  const loose = orphans()
  return {
    meetings: meetings.length,
    audioFiles: audio.filter((m) => fileSize(m.audioPath) > 0).length,
    orphanFiles: loose.length,
    audioBytes:
      [...audio, ...meetings].reduce((t, m) => t + fileSize(m.audioPath), 0) +
      loose.reduce((t, p) => t + fileSize(p), 0),
  }
}

/** Windows compares paths case-insensitively and the DB stores whatever `join` produced,
 *  so both sides are normalised before they are matched. */
function samePath(path: string): string {
  return resolve(path).toLowerCase()
}

/** Recordings on disk that no meeting points at. */
function orphans(): string[] {
  const referenced = new Set(listAudioPaths().map(samePath))
  return listRecordings()
    .map((r) => r.path)
    .filter((p) => !referenced.has(samePath(p)))
}

/** Removes everything past its limit and reports what actually went. Anything that
 *  could not go — a locked file, or a meeting still being summarised — counts as failed,
 *  keeps its pointer, and is retried next run. */
export function runRetention(): RetentionResult {
  const { meetings, audio } = due()
  const result: RetentionResult = {
    meetings: 0,
    audioFiles: 0,
    audioBytes: 0,
    orphanFiles: 0,
    failed: 0,
  }
  for (const m of audio) {
    const bytes = fileSize(m.audioPath)
    if (removeAudioFile(m.audioPath)) {
      clearMeetingAudioPath(m.id)
      if (bytes > 0) {
        result.audioFiles++
        result.audioBytes += bytes
      }
    } else {
      result.failed++
    }
  }
  for (const m of meetings) {
    const bytes = fileSize(m.audioPath)
    switch (removeMeeting(m.id)) {
      case 'removed':
        result.meetings++
        result.audioBytes += bytes
        break
      case 'audio-locked':
      case 'busy': // summarising or re-diarizing — its rows are still being written
      case 'live': // unreachable (a live meeting has no ended_at), never guessed at
        result.failed++
        break
      case 'missing':
        break // gone since the snapshot (deleted by hand) — nothing to count
    }
  }
  // last, so a meeting deleted above has already given up its file
  for (const path of orphans()) {
    const bytes = fileSize(path)
    if (removeAudioFile(path)) {
      result.orphanFiles++
      result.audioBytes += bytes
    } else {
      result.failed++
    }
  }
  if (result.meetings > 0 || result.audioFiles > 0 || result.failed > 0 || result.orphanFiles > 0) {
    console.log(
      `[sanas] retention: removed ${result.meetings} meeting(s), ${result.audioFiles} audio file(s)` +
        (result.orphanFiles > 0 ? `, ${result.orphanFiles} orphaned recording(s)` : '') +
        (result.failed > 0 ? `, ${result.failed} not removable yet (retry next run)` : ''),
    )
  }
  return result
}

let timer: ReturnType<typeof setInterval> | null = null

/** Nothing here is worth the app for: an exception in a timer callback has no catch above
 *  it and ends the main process, and the disk that fails a delete is exactly the state
 *  clean-up exists for. On demand (from Settings) it still throws, so the user sees why. */
function runQuietly(): void {
  try {
    runRetention()
  } catch (e) {
    console.warn('[sanas] retention run failed:', e)
  }
}

/** Runs shortly after launch and every few hours after that. */
export function scheduleRetention(): void {
  if (timer) return
  setTimeout(runQuietly, FIRST_RUN_DELAY_MS)
  timer = setInterval(runQuietly, RUN_EVERY_MS)
}
