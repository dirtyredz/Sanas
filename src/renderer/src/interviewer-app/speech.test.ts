import { afterEach, expect, it, vi } from 'vitest'
import { localVoice } from './speech'
afterEach(() => vi.useRealTimers())
it('selects a local English voice and never a network voice', async () => {
  const local = { localService: true, lang: 'en-US', default: false }
  const synth = {
    getVoices: () => [{ localService: false, lang: 'en-US', default: true }, local],
  } as SpeechSynthesis
  expect(await localVoice(synth)).toBe(local)
})
it('fails closed when no offline voice is available', async () => {
  vi.useFakeTimers()
  const promise = localVoice({ getVoices: () => [] } as unknown as SpeechSynthesis)
  const failed = expect(promise).rejects.toThrow('No offline Windows speech voice')
  await vi.advanceTimersByTimeAsync(2000)
  await failed
  expect(vi.getTimerCount()).toBe(0)
})
