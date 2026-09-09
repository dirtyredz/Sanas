import type { Meeting } from '@shared/types'
import { getDb } from '../../db'
import { applyMerge, deleteMeeting, getMeeting } from '../../db/repos/meetings'
import { maxSpeaker, reassignSegments } from '../../db/repos/segments'
import { reassignSuggestions } from '../../db/repos/suggestions'
import { reassignSpeakerNames } from '../../db/repos/speakers'
import { isPostProcessing } from './post-processing'
import { removeAudioFile } from './remove'
import { planMerge, type MergePart } from './merge-plan'

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
export function mergeMeetings(ids: number[]): Meeting {
  const parts = ids.map((id) => {
    const m = getMeeting(id)
    if (!m) throw new Error(`Meeting ${id} no longer exists.`)
    if (isPostProcessing(id)) {
      throw new Error(`"${m.title}" is still being summarised — try again in a moment.`)
    }
    return m
  })
  const plan = planMerge(parts.map(toPart))

  getDb().transaction(() => {
    for (const step of plan.steps) {
      reassignSegments(step.from, plan.keepId, step.timeOffsetMs, step.speakerOffset)
      reassignSuggestions(step.from, plan.keepId, step.timeOffsetMs)
      reassignSpeakerNames(step.from, plan.keepId, step.speakerOffset)
      deleteMeeting(step.from) // its rows have moved, so nothing is left to cascade
    }
    applyMerge(plan.keepId, plan.endedAt, plan.summary, plan.actionItems)
  })()

  // files only after the row is committed: an orphaned file is recoverable, a row
  // pointing at a file that is no longer there is not
  for (const m of parts) removeAudioFile(m.audioPath)

  console.log(
    `[sanas] merged ${plan.steps.length + 1} meetings into ${plan.keepId}:`,
    plan.steps
      .map((s) => `${s.from} (+${s.timeOffsetMs}ms, speakers +${s.speakerOffset})`)
      .join(', '),
  )
  return getMeeting(plan.keepId)!
}
