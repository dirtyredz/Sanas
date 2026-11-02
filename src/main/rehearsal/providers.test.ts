import { afterEach, expect, it, vi } from 'vitest'
import { ScriptedSttProvider, RehearsalAssistant } from './providers'
import { CLASSIFIER_SYSTEM } from '../services/assistant/classifier'
import type { AssistRequest } from '../services/assistant/types'
import type { Step } from './scenario'

afterEach(() => vi.useRealTimers())
const utterance: Extract<Step, { kind: 'utterance' }> = {
  id: 'one',
  kind: 'utterance',
  atMs: 100,
  durationMs: 200,
  channel: 'them',
  speaker: 3,
  text: 'What is the delivery date?',
}
it('emits ephemeral interim, channel final and boundary in order; Stop retires callbacks', async () => {
  const provider = new ScriptedSttProvider(),
    transcript = vi.fn(),
    signal = vi.fn()
  const session = await provider.start({
    apiKey: '',
    channels: 2,
    keyterms: [],
    onTranscript: transcript,
    onSignal: signal,
    onError: vi.fn(),
  })
  provider.utterance(utterance)
  expect(transcript.mock.calls[0][0]).toMatchObject({ isFinal: false, channel: 1, speaker: 3 })
  provider.tick(299)
  expect(transcript).toHaveBeenCalledTimes(1)
  provider.tick(300)
  expect(transcript.mock.calls[1][0]).toMatchObject({
    isFinal: true,
    text: utterance.text,
    tEndMs: 300,
  })
  expect(signal).toHaveBeenCalledWith({
    kind: 'boundary',
    channel: 1,
    atMs: 300,
    source: 'endpoint',
  })
  expect(await provider.transcribeFile()).toHaveLength(1)
  await session.stop()
  provider.utterance(utterance)
  provider.tick(1000)
  expect(transcript).toHaveBeenCalledTimes(2)
})
it('drops unfinished speech on disconnect and accepts finals after reconnect', async () => {
  const provider = new ScriptedSttProvider(),
    transcript = vi.fn(),
    signal = vi.fn()
  await provider.start({
    apiKey: '',
    channels: 2,
    keyterms: [],
    onTranscript: transcript,
    onSignal: signal,
    onError: vi.fn(),
  })
  provider.utterance(utterance)
  provider.drop(150, 500)
  provider.tick(300)
  expect(signal).toHaveBeenCalledWith({ kind: 'reset' })
  expect(transcript).toHaveBeenCalledTimes(1)
  provider.tick(650)
  expect(provider.reconnects).toBe(1)
  provider.utterance({ ...utterance, atMs: 700, channel: 'me' })
  provider.tick(900)
  expect(transcript.mock.calls.at(-1)?.[0]).toMatchObject({ channel: 0, isFinal: true })
})
const req: AssistRequest = {
  apiKey: '',
  system: 'system',
  userContent: 'Delivery is Friday.',
  model: 'canned',
  effort: 'low',
  maxTokens: 200,
}
it('uses the actual image request and forwards real provider calls without inventing answers', async () => {
  const p = new RehearsalAssistant(() => 0)
  expect(await p.complete({ ...req, system: CLASSIFIER_SYSTEM })).toBe('question me')
  expect(
    await p.complete({ ...req, image: { mediaType: 'image/png', base64: 'actual-bytes' } }),
  ).toContain('dashboard')
  expect(p.requests.at(-1)?.image).toBe('actual-bytes')
  const complete = vi.fn().mockResolvedValue('real answer')
  expect(await new RehearsalAssistant(() => 0, { complete }).complete(req)).toBe('real answer')
  expect(complete).toHaveBeenCalledWith(req)
})
it('supports delay, abort and failure without leaking timers', async () => {
  vi.useFakeTimers()
  const p = new RehearsalAssistant(() => 0)
  p.slowUntil = 1000
  const controller = new AbortController()
  const call = p.complete({ ...req, signal: controller.signal })
  const rejected = expect(call).rejects.toThrow('cancelled')
  controller.abort()
  await rejected
  expect(vi.getTimerCount()).toBe(0)
  p.slowUntil = 0
  p.failUntil = 100
  await expect(p.complete(req)).rejects.toThrow('Injected')
})
