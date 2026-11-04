import type { CompletedTurn } from '../../turns/types'

/** Optional local observation only. No decisions, timers, IPC, keys or persistence. */
export interface AssistDiagnostic {
  event: string
  turn?: CompletedTurn
  reason?: string
  /** The run this event concerns (answer start, speculation): correlates the candidate turn
   *  with its suggestion events and request records. */
  suggestionId?: number
}
let observer: ((event: AssistDiagnostic) => void) | undefined
export function observeRehearsalAssistance(next?: (event: AssistDiagnostic) => void): void {
  if (!process.argv.includes('--rehearsal'))
    throw new Error('Rehearsal observer requires explicit mode')
  observer = next
}
const listeners = new Set<(event: AssistDiagnostic) => void>()
export function subscribeAssistance(listener: (event: AssistDiagnostic) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function observeAssistance(event: AssistDiagnostic): void {
  // Diagnostics must never alter admission or fail-closed behavior.
  try {
    observer?.(event)
    for (const listener of listeners) listener(event)
  } catch {
    /* observer is best effort */
  }
}
