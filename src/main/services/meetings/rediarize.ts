import { existsSync } from 'fs'
import { loadSettings } from '../../config/settings'
import { deepgramProvider } from '../stt/deepgram'
import { getMeeting } from '../../db/repos/meetings'
import { deleteSegmentsForMeeting, insertSegment } from '../../db/repos/segments'
import { clearSpeakerNames } from '../../db/repos/speakers'
import { getGlossaryTerms } from '../../db/repos/jobs'
import { getDb } from '../../db'

// Post-meeting re-diarization: streaming diarization drifts (S2 becomes S7 mid-
// meeting) because it labels voices incrementally with no lookahead. Batch sees
// the whole recording, so its labels are stable. Replaces the live segments
// with the batch result; channel semantics match live (0 = user, 1+ = others).

export async function rediarizeMeeting(meetingId: number, channels: number): Promise<void> {
  const { deepgramApiKey } = loadSettings()
  if (!deepgramApiKey) return
  const meeting = getMeeting(meetingId)
  if (!meeting?.audioPath || !existsSync(meeting.audioPath)) return

  try {
    const transcripts = await deepgramProvider.transcribeFile(meeting.audioPath, {
      apiKey: deepgramApiKey,
      channels,
      keyterms: getGlossaryTerms(meeting.jobId)
    })
    if (transcripts.length === 0) return // don't wipe real segments for an empty result

    const stereo = channels === 2
    getDb().transaction(() => {
      deleteSegmentsForMeeting(meetingId)
      clearSpeakerNames(meetingId) // indices changed; stale names would mislabel
      for (const t of transcripts) {
        const isUser = stereo ? t.channel === 0 : false
        insertSegment({
          meetingId,
          tStartMs: t.tStartMs,
          tEndMs: t.tEndMs,
          speaker: stereo && t.channel === 0 ? -1 : t.speaker,
          isUser,
          text: t.text
        })
      }
    })()
    console.log(`[sanas] re-diarized meeting ${meetingId}: ${transcripts.length} segments`)
  } catch (e) {
    console.warn('[sanas] re-diarization failed (live segments kept):', e)
  }
}
