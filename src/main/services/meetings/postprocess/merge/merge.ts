import type { Meeting, MergeResult } from '@shared/types'
import { getDb } from '../../../../db'
import { applyMerge, deleteMeeting, getMeeting } from '../../../../db/repos/meeting/meetings'
import { maxSpeaker, reassignSegments } from '../../../../db/repos/transcript/segments'
import {
  clearSuggestionContextRevisions,
  reassignSuggestions,
  shiftSuggestionContextRevisions,
} from '../../../../db/repos/suggestion/suggestions'
import { reassignSpeakerNames } from '../../../../db/repos/transcript/speakers'
import { isPostProcessing } from '../../status/post-processing'
import { removeAudioFile } from '../../records/remove'
import { CONTEXT_REVISION_OFFSET, planMerge, type MergePart } from './merge-plan'
import { getMeetingGrounding } from '../../../../db/repos/meeting/meeting-grounding'
import { hasMeetingContext, moveContextHistory } from '../../../../db/repos/meeting/meeting-context'
import { hasLegacySlides } from '../../../../db/repos/meeting/meeting-presentation'

// Folds several meeting rows into one — the repair for a conversation that a dropped
// connection split into pieces before Pause existed, and for any stop/start done by hand.
// The rules live in merge-plan.ts; this is the database half.
//
// Every part's recording is deleted, including the kept one's. A merged meeting spans
// audio that no single WAV holds, so the survivor would misrepresent it — and worse,
// post-meeting re-diarization reads that WAV and replaces the WHOLE transcript, which
// would silently reduce a merged meeting back to one part. Dropping the audio is the
// honest trade: the transcript is what the merge is for.

function toPart(m: Meeting): MergePart {
  return {
    id: m.id,
    hasLegacySlides: hasLegacySlides(m.id),
    hasMeetingContext: hasMeetingContext(m.id),
    jobId: m.jobId,
    startedAt: m.startedAt,
    endedAt: m.endedAt,
    summary: m.summary,
    actionItems: m.actionItems,
    maxSpeaker: maxSpeaker(m.id),
  }
}

/** Merges the given meetings into their earliest one and returns the result.
 *  Irreversible: the other rows and every part's recording are deleted. */
export function mergeMeetings(ids: number[]): MergeResult {
  const parts = ids.map((id) => {
    const m = getMeeting(id)
    if (!m) throw new Error(`Meeting ${id} no longer exists.`)
    if (getMeetingGrounding(id).hasBiography)
      throw new Error('Meetings with resumes or interview profiles cannot be merged.')
    if (m.practice) throw new Error('Practice sessions cannot be merged.')
    if (isPostProcessing(id)) {
      throw new Error(`"${m.title}" is still being written to — try again in a moment.`)
    }
    return m
  })
  const plan = planMerge(parts.map(toPart))

  getDb().transaction(() => {
    for (const step of plan.steps) {
      // context first: the moved revisions and the suggestions naming them shift together
      if (step.context === 'move') {
        moveContextHistory(step.from, plan.keepId, CONTEXT_REVISION_OFFSET, step.timeOffsetMs)
        shiftSuggestionContextRevisions(step.from, CONTEXT_REVISION_OFFSET)
      } else if (step.context === 'unlink') clearSuggestionContextRevisions(step.from)
      reassignSegments(step.from, plan.keepId, step.timeOffsetMs, step.speakerOffset)
      reassignSuggestions(step.from, plan.keepId, step.timeOffsetMs)
      reassignSpeakerNames(step.from, plan.keepId, step.speakerOffset)
      deleteMeeting(step.from) // its rows have moved, so nothing is left to cascade
    }
    applyMerge(plan.keepId, plan.endedAt, plan.summary, plan.actionItems)
  })()

  // files only after the row is committed: an orphaned file is recoverable, a row
  // pointing at a file that is no longer there is not. One that is locked right now is
  // reported to the caller and swept by retention later — never silently left behind.
  const stuck = parts.filter((m) => !removeAudioFile(m.audioPath)).map((m) => m.audioPath)
  if (stuck.length > 0) {
    console.warn('[sanas] merge could not delete recordings (retention will sweep them):', stuck)
  }

  console.log(
    `[sanas] merged ${plan.steps.length + 1} meetings into ${plan.keepId}:`,
    plan.steps
      .map((s) => `${s.from} (+${s.timeOffsetMs}ms, speakers +${s.speakerOffset})`)
      .join(', '),
  )
  return { meeting: getMeeting(plan.keepId)!, recordingsLeftBehind: stuck.length }
}
