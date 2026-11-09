// Which meetings are still being rewritten in the background. Summarising (on stop and
// on demand) and re-diarizing both replace parts of a meeting long after the call that
// started them returned, so anything that rewrites a meeting wholesale — merge above all —
// has to know not to touch one mid-flight: re-diarization replaces every segment, and a
// late summary would land on a row that merge may have folded away or rewritten.
//
// Counted rather than flagged: a meeting can be summarising on demand while its
// re-diarization is still running, and the first to finish must not clear the second.

import { createChangeSignal } from './change-signal'

const working = new Map<number, number>()
const changed = createChangeSignal()

/** Fires whenever a meeting starts or finishes post-processing work. */
export const onPostProcessingChange = changed.subscribe

export function markPostProcessing(meetingId: number): void {
  working.set(meetingId, (working.get(meetingId) ?? 0) + 1)
  changed.notify()
}

export function clearPostProcessing(meetingId: number): void {
  const n = (working.get(meetingId) ?? 0) - 1
  if (n > 0) working.set(meetingId, n)
  else working.delete(meetingId)
  changed.notify()
}

export function isPostProcessing(meetingId: number): boolean {
  return working.has(meetingId)
}

export function postProcessingCount(): number {
  return [...working.values()].reduce((sum, count) => sum + count, 0)
}

/** Runs `work`, keeping the meeting marked until it settles. */
export async function whilePostProcessing<T>(
  meetingId: number,
  work: () => Promise<T>,
): Promise<T> {
  markPostProcessing(meetingId)
  try {
    return await work()
  } finally {
    clearPostProcessing(meetingId)
  }
}
