import type { ContextUpdate, MeetingContext } from '@shared/live-controls/types'

/** Pure preparation followed by commit, then publication. Failed persistence changes nothing. */
export function applyContext(
  current: MeetingContext,
  update: ContextUpdate,
  atMs: number,
  persist: (next: MeetingContext, atMs: number) => void,
  publish: (next: MeetingContext) => void,
): MeetingContext {
  if (current.meetingId !== update.meetingId) throw new Error('This meeting is no longer active.')
  if (current.revision !== update.expectedRevision)
    throw new Error('Context changed. Reload before applying.')
  if (current.text === update.text) return current
  const next: MeetingContext = { ...current, text: update.text, revision: current.revision + 1 }
  persist(next, atMs)
  publish(next)
  return next
}
