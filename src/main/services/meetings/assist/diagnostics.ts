import type { CompletedTurn } from '../../turns/types'

/** Optional local observation only. No decisions, timers, IPC, keys or persistence. */
export interface AssistDiagnostic {
  event: string
  turn?: CompletedTurn
  reason?: string
}
let observer: ((event: AssistDiagnostic) => void) | undefined
export function observeRehearsalAssistance(next?: (event: AssistDiagnostic) => void): void {
  if (!process.argv.includes('--rehearsal'))
    throw new Error('Rehearsal observer requires explicit mode')
  observer = next
}
export function observeAssistance(event: AssistDiagnostic): void {
  // Diagnostics must never alter admission or fail-closed behavior.
  try {
    observer?.(event)
  } catch {
    /* observer is best effort */
  }
}
