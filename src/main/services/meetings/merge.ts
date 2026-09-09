import type { Meeting } from '@shared/types'
import { getDb } from '../../db'
import { deleteMeeting, getMeeting, updateMeetingSpan } from '../../db/repos/meetings'
import { maxSpeaker, reassignSegments } from '../../db/repos/segments'
import { reassignSuggestions } from '../../db/repos/suggestions'
import { reassignSpeakerNames } from '../../db/repos/speakers'
import { planMerge, type MergePart } from './merge-plan'

// Folds several meeting rows into one — the repair for a conversation that a dropped
// connection split into pieces before Pause existed, and for any stop/start done by hand.
// The rules live in merge-plan.ts; this is the database half.

function toPart(id: number): MergePart {
  const m = getMeeting(id)
  if (!m) throw new Error(`Meeting ${id} no longer exists.`)
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
 *  Irreversible: the other rows are deleted once their contents have moved. */
export function mergeMeetings(ids: number[]): Meeting {
  const plan = planMerge(ids.map(toPart))
  getDb().transaction(() => {
    for (const step of plan.steps) {
      reassignSegments(step.from, plan.keepId, step.timeOffsetMs, step.speakerOffset)
      reassignSuggestions(step.from, plan.keepId, step.timeOffsetMs)
      reassignSpeakerNames(step.from, plan.keepId, step.speakerOffset)
      deleteMeeting(step.from) // its rows have moved, so nothing is left to cascade
    }
    updateMeetingSpan(plan.keepId, plan.endedAt, plan.summary, plan.actionItems)
  })()
  console.log(
    `[sanas] merged ${plan.steps.length + 1} meetings into ${plan.keepId}:`,
    plan.steps
      .map((s) => `${s.from} (+${s.timeOffsetMs}ms, speakers +${s.speakerOffset})`)
      .join(', '),
  )
  return getMeeting(plan.keepId)!
}
