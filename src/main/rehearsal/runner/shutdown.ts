import * as meetings from '../../services/meetings'
import { isPostProcessing } from '../../services/meetings/status/post-processing'
import { listSegments } from '../../db/repos/segments'
import type { RehearsalOptions } from './options'
import type { RehearsalAssistant } from '../outcomes/providers'
import { sleep } from './clock'

/**
 * Stops the rehearsal meeting and waits out post-processing. Returns the live segment rows read
 * BEFORE the stop (batch replacement would hide an interim-persistence defect) and the stop time.
 */
export async function stopMeetingAndWait({
  options,
  model,
  meetingId,
  now,
}: {
  options: RehearsalOptions
  model: RehearsalAssistant
  meetingId: number
  now(): number
}) {
  const { assistant, tier } = options
  const liveRows = listSegments(meetingId)
  const stoppedMs = now()
  for (const request of model.requests) request.pendingAtStop = request.status === 'pending'
  await meetings.stopMeeting()
  const deadline = performance.now() + (assistant === 'claude' || tier === 'audio' ? 330000 : 10000)
  while (isPostProcessing(meetingId) && performance.now() < deadline) await sleep(20)
  if (isPostProcessing(meetingId)) throw new Error('Post-processing deadline exceeded')
  return { liveRows, stoppedMs }
}
