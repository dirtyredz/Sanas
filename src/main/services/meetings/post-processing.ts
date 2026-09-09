// Which meetings are still being worked on after they stopped. Summarising and
// re-diarizing are fire-and-forget, so anything that rewrites a meeting wholesale —
// merge above all — has to know not to touch one mid-flight: re-diarization replaces
// every segment, and would happily replace a just-merged transcript with the
// transcription of one part's recording.

const working = new Set<number>()

export function markPostProcessing(meetingId: number): void {
  working.add(meetingId)
}

export function clearPostProcessing(meetingId: number): void {
  working.delete(meetingId)
}

export function isPostProcessing(meetingId: number): boolean {
  return working.has(meetingId)
}
