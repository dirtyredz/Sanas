import { expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('../../services/assistant/provider/claude', () => ({
  claudeProvider: { complete: vi.fn() },
}))
import { installRehearsalStt, sttProvider } from '../../services/stt'
import { deepgramProvider } from '../../services/stt/deepgram/deepgram'
import {
  installRehearsalAssistant,
  assistantProvider,
} from '../../services/assistant/provider/provider'
import { claudeProvider } from '../../services/assistant/provider/claude'
import { observeRehearsalBroadcast } from '../../windows/broadcast'
import { installRehearsalDesktop } from '../../services/screen-capture'

it('normal launch retains real providers and rejects rehearsal installation', () => {
  expect(process.argv).not.toContain('--rehearsal')
  expect(sttProvider).toBe(deepgramProvider)
  expect(assistantProvider).toBe(claudeProvider)
  expect(() => installRehearsalStt(deepgramProvider)).toThrow('Rehearsal mode required')
  expect(() => installRehearsalAssistant(claudeProvider)).toThrow('Rehearsal mode required')
  expect(() => observeRehearsalBroadcast(vi.fn())).toThrow('Rehearsal mode required')
  expect(() => installRehearsalDesktop({} as never)).toThrow('Rehearsal mode required')
})
