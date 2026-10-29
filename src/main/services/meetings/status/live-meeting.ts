// Which meeting is live right now, if any.
//
// The orchestrator (./index.ts) owns the running meeting, but one fact about it is needed
// outside: deleting a meeting must refuse the one main is still writing to, or the next
// final lands on a row that is gone (a foreign-key failure inside the provider's socket
// listener). Delete cannot import the orchestrator to ask — it is the low-level half of
// removal, used by retention as well — so the fact lives here, on its own, with the
// orchestrator as its only writer.

let live: number | null = null

/** Called by the orchestrator, and by nothing else. */
export function setLiveMeeting(id: number | null): void {
  live = id
}

export function liveMeetingId(): number | null {
  return live
}

export function isLiveMeeting(id: number): boolean {
  return live === id
}
