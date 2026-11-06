// Composition point: THE selected STT provider. Everything outside services/stt/
// imports from here — swapping providers stays a one-line change.
import { deepgramProvider } from './deepgram/deepgram'
import type { SttProvider } from './types'

export let sttProvider: SttProvider = deepgramProvider

/** Explicit diagnostics composition only; never exposed through IPC or settings. */
export function installRehearsalStt(provider: SttProvider): void {
  if (!process.argv.includes('--rehearsal')) throw new Error('Rehearsal mode required')
  sttProvider = provider
}
