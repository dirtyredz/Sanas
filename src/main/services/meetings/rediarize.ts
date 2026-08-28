import { existsSync } from 'fs'
import { loadSettings } from '../../config/settings'
import { sttProvider } from '../stt'
import { getMeeting } from '../../db/repos/meetings'
import { deleteSegmentsForMeeting, insertSegment } from '../../db/repos/segments'
import { clearSpeakerNames } from '../../db/repos/speakers'
import { getGlossaryTerms } from '../../db/repos/jobs'
import { getDb } from '../../db'
import { resolveSpeakerIdentity } from './channel-identity'

// Post-meeting re-diarization: streaming diarization drifts (S2 becomes S7 mid-
// meeting) because it labels voices incrementally with no lookahead. Batch sees
// the whole recording, so its labels are stable. Replaces the live segments
// with the batch result; channel semantics match live (0 = user, 1+ = others).

/** Returns true when segments were replaced (caller broadcasts the update). */
export async function rediarizeMeeting(meetingId: number, channels: number): Promise<boolean> {
  const { deepgramApiKey } = loadSettings()
  if (!deepgramApiKey) return false
  const meeting = getMeeting(meetingId)
  if (!meeting?.audioPath || !existsSync(meeting.audioPath)) return false

  try {
    const transcripts = await sttProvider.transcribeFile(meeting.audioPath, {
      apiKey: deepgramApiKey,
      channels,
      keyterms: getGlossaryTerms(meeting.jobId)
    })
    if (transcripts.length === 0) return false // don't wipe real segments for an empty result

    const stereo = channels === 2
    getDb().transaction(() => {
      deleteSegmentsForMeeting(meetingId)
      clearSpeakerNames(meetingId) // indices changed; stale names would mislabel
      for (const t of transcripts) {
        const who = resolveSpeakerIdentity(t.channel, t.speaker, stereo)
        insertSegment({
          meetingId,
          tStartMs: t.tStartMs,
          tEndMs: t.tEndMs,
          speaker: who.speaker,
          isUser: who.isUser,
          text: t.text
        })
      }
    })()
    console.log(`[sanas] re-diarized meeting ${meetingId}: ${transcripts.length} segments`)
    return true
  } catch (e) {
    console.warn('[sanas] re-diarization failed (live segments kept):', e)
    return false
  }
}
