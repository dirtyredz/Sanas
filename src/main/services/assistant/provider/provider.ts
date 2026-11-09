import { claudeProvider } from './claude'
import type { AssistantProvider } from '../types'

export let assistantProvider: AssistantProvider = claudeProvider

/** Main-only diagnostics composition, unavailable to a normal launch. */
export function installRehearsalAssistant(provider: AssistantProvider): void {
  if (!process.argv.includes('--rehearsal')) throw new Error('Rehearsal mode required')
  assistantProvider = provider
}
