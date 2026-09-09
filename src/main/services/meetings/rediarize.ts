import { existsSync } from 'fs'
import { loadSettings } from '../../config/settings'
import { sttProvider } from '../stt'
import { getMeeting } from '../../db/repos/meetings'
import { deleteSegmentsForMeeting, insertSegment, listSegments } from '../../db/repos/segments'
import { clearSpeakerNames, setSpeakerName, speakerNameMap } from '../../db/repos/speakers'
import { getGlossaryTerms } from '../../db/repos/jobs'
import { getDb } from '../../db'
import { resolveSpeakerIdentity } from './channel-identity'
import { carrySpeakerNames, carryUserIdentity } from './speaker-carryover'

// Post-meeting re-diarization: streaming diarization drifts (S2 becomes S7 mid-
// meeting) because it labels voices incrementally with no lookahead. Batch sees
// the whole recording, so its labels are stable. Replaces the live segments
// with the batch result; channel semantics match live (0 = user, 1+ = others).
// Batch re-numbers the voices, so "that's me" pins (mono capture) and speaker
// names are carried over by time overlap rather than by index.

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
      keyterms: getGlossaryTerms(meeting.jobId),
    })
    if (transcripts.length === 0) return false // don't wipe real segments for an empty result

    const stereo = channels === 2
    const next = transcripts.map((t) => {
      const who = resolveSpeakerIdentity(t.channel, t.speaker, stereo)
      return { tStartMs: t.tStartMs, tEndMs: t.tEndMs, text: t.text, ...who }
    })
    const prev = listSegments(meetingId)
    // mono: batch gives every segment isUser=false (no pins are passed to
    // resolveSpeakerIdentity here), so the pinned voices are re-found by overlap;
    // stereo: the channel already decided, nothing to carry
    const userSpeakers = stereo
      ? new Set<number>()
      : carryUserIdentity(
          prev.filter((s) => s.isUser),
          next,
        )
    // names belong to the other voices only — the user's own speech (channel 0 in
    // stereo, carried pins in mono) is never a naming candidate on either side
    const names = carrySpeakerNames(
      prev.filter((s) => !s.isUser),
      next.filter((s) => !s.isUser && !userSpeakers.has(s.speaker)),
      speakerNameMap(meetingId),
    )

    getDb().transaction(() => {
      deleteSegmentsForMeeting(meetingId)
      clearSpeakerNames(meetingId) // indices changed; re-key below
      for (const s of next) {
        insertSegment({
          meetingId,
          tStartMs: s.tStartMs,
          tEndMs: s.tEndMs,
          speaker: s.speaker,
          isUser: s.isUser || userSpeakers.has(s.speaker),
          text: s.text,
        })
      }
      for (const [speaker, name] of names) setSpeakerName(meetingId, speaker, name)
    })()
    console.log(
      `[sanas] re-diarized meeting ${meetingId}: ${transcripts.length} segments, ` +
        `${names.size} name(s) carried, ${userSpeakers.size} voice(s) kept as me`,
    )
    return true
  } catch (e) {
    console.warn('[sanas] re-diarization failed (live segments kept):', e)
    return false
  }
}
