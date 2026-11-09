import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DeepgramSession } from '../deepgram-session'
import { FakeSocket } from './fake-socket.test-support'
import type { SttSessionOptions } from '../../types'

let session: DeepgramSession
beforeEach(() => {
  vi.useFakeTimers()
  FakeSocket.instances = []
  vi.stubGlobal('WebSocket', FakeSocket)
})
afterEach(async () => {
  await session.stop()
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const latest = () => FakeSocket.instances.at(-1)!
const sent = (socket: FakeSocket) => socket.sent.filter(Buffer.isBuffer)
async function setup(extra: Partial<SttSessionOptions> = {}) {
  const onError = vi.fn(),
    onSignal = vi.fn(),
    onTranscript = vi.fn()
  session = new DeepgramSession({
    apiKey: 'fake',
    channels: 1,
    keyterms: [],
    onError,
    onSignal,
    onTranscript,
    ...extra,
  })
  const ready = session.connect()
  latest().open()
  await ready
  return { onError, onSignal, onTranscript }
}
async function reopen(delay = 1000) {
  await vi.advanceTimersByTimeAsync(delay)
  latest().open()
  await vi.advanceTimersByTimeAsync(0)
  return latest()
}

it('replays owned backoff audio ahead of live audio after a failed open', async () => {
  await setup()
  latest().emit('close', { code: 1006 })
  const chunk = Buffer.from([1, 2])
  session.sendAudio(chunk)
  chunk.fill(99)
  await vi.advanceTimersByTimeAsync(1000)
  latest().emit('error')
  await vi.advanceTimersByTimeAsync(0)
  session.sendAudio(Buffer.from([3, 4]))
  const socket = await reopen(2000)
  session.sendAudio(Buffer.from([5, 6]))
  expect(Buffer.concat(sent(socket))).toEqual(Buffer.from([1, 2, 3, 4, 5, 6]))
})

it('a failed initial drain advances backoff and retains only its unsent suffix', async () => {
  const { onSignal, onTranscript } = await setup({ startOffsetMs: 123.5 })
  session.sendAudio(Buffer.alloc(2))
  latest().emit('close', { code: 1006 })
  session.sendAudio(Buffer.from([1, 2]))
  session.sendAudio(Buffer.from([3, 4]))
  session.sendAudio(Buffer.from([5, 6]))
  await vi.advanceTimersByTimeAsync(1000)
  const failed = latest()
  const send = failed.send.bind(failed)
  failed.send = (data) => {
    if (sent(failed).length === 1) throw new Error('transport failed')
    send(data)
  }
  failed.open()
  await vi.advanceTimersByTimeAsync(0)
  expect(onSignal.mock.calls).toHaveLength(2)
  const next = await reopen(2000)
  expect(Buffer.concat(sent(next))).toEqual(Buffer.from([3, 4, 5, 6]))
  next.message({
    type: 'Results',
    is_final: true,
    channel_index: [0, 1],
    channel: {
      alternatives: [{ transcript: 'Hi', words: [{ word: 'Hi', speaker: 0, start: 0, end: 1 }] }],
    },
  })
  expect(onTranscript.mock.calls[0][0].tStartMs).toBe(124)
})

it.each([1, 2] as const)(
  'uses the replay origin for all normalized events (%s channels)',
  async (channels) => {
    const { onTranscript, onSignal } = await setup({ channels, startOffsetMs: 50.25 })
    session.sendAudio(Buffer.alloc(2 * channels))
    latest().emit('close', { code: 1006 })
    session.sendAudio(Buffer.alloc(32000 * channels))
    const socket = await reopen()
    socket.message({ type: 'SpeechStarted', channel: [0], timestamp: 0.5 })
    socket.message({ type: 'UtteranceEnd', channel: [0], last_word_end: 1 })
    const result = {
      type: 'Results',
      is_final: true,
      speech_final: true,
      channel_index: [0, channels],
      start: 0,
      duration: 1,
      channel: {
        alternatives: [{ transcript: 'Hi', words: [{ word: 'Hi', speaker: 0, start: 0, end: 1 }] }],
      },
    }
    socket.message({ ...result, is_final: false, speech_final: false })
    socket.message(result)
    expect(onTranscript.mock.calls.map(([t]) => t.tStartMs)).toEqual([50, 50])
    expect(onSignal.mock.calls.map(([s]) => s)).toEqual(
      expect.arrayContaining([
        { kind: 'activity', channel: 0, atMs: 550 },
        { kind: 'boundary', channel: 0, atMs: 1050, source: 'utterance-end' },
        { kind: 'boundary', channel: 0, atMs: 1050, source: 'endpoint' },
      ]),
    )
  },
)

it('pauses on socket pressure and yields between bounded drain iterations', async () => {
  await setup()
  const socket = latest()
  socket.bufferedAmount = 256000
  session.sendAudio(Buffer.alloc(320000, 1))
  session.sendAudio(Buffer.from([2, 3]))
  expect(sent(socket)).toEqual([])
  await vi.advanceTimersByTimeAsync(50)
  expect(sent(socket)).toEqual([])
  socket.bufferedAmount = 0
  await vi.advanceTimersByTimeAsync(10)
  expect(Buffer.concat(sent(socket)).length).toBe(128000)
  await vi.advanceTimersByTimeAsync(30)
  expect(Buffer.concat(sent(socket))).toEqual(
    Buffer.concat([Buffer.alloc(320000, 1), Buffer.from([2, 3])]),
  )
})

it('a later paced-drain failure belongs to the same recovery attempt', async () => {
  await setup()
  latest().emit('close', { code: 1006 })
  session.sendAudio(Buffer.alloc(160000, 7))
  await vi.advanceTimersByTimeAsync(1000)
  const failed = latest()
  failed.open()
  await vi.advanceTimersByTimeAsync(0)
  expect(Buffer.concat(sent(failed)).length).toBe(128000)
  failed.send = () => {
    throw new Error('later drain failed')
  }
  await vi.advanceTimersByTimeAsync(10)
  await vi.advanceTimersByTimeAsync(1000)
  expect(FakeSocket.instances).toHaveLength(2)
  const next = await reopen(1000)
  expect(Buffer.concat(sent(next))).toEqual(Buffer.alloc(32000, 7))
})

it('accumulates fractional PCM duration before rounding normalized events', async () => {
  const { onTranscript } = await setup()
  for (let n = 0; n < 16; n++) session.sendAudio(Buffer.alloc(2))
  latest().emit('close', { code: 1006 })
  session.sendAudio(Buffer.alloc(2))
  const next = await reopen()
  next.message({
    type: 'Results',
    is_final: true,
    channel_index: [0, 1],
    channel: {
      alternatives: [{ transcript: 'Hi', words: [{ word: 'Hi', speaker: 0, start: 0, end: 1 }] }],
    },
  })
  expect(onTranscript.mock.calls[0][0].tStartMs).toBe(1)
})

it.each([1, 2] as const)(
  'fails explicitly at the 30-second limit (%s channels)',
  async (channels) => {
    const { onError } = await setup({ channels })
    latest().emit('close', { code: 1006 })
    session.sendAudio(Buffer.alloc(30 * 32000 * channels))
    expect(onError).not.toHaveBeenCalled()
    session.sendAudio(Buffer.alloc(2 * channels))
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('buffer full (30 seconds)'))
    await vi.advanceTimersByTimeAsync(60000)
    expect(FakeSocket.instances).toHaveLength(1)
  },
)

it('stop cancels a pressure-blocked pump and ignores late capture and transcripts', async () => {
  const { onTranscript } = await setup()
  const socket = latest()
  socket.bufferedAmount = 256000
  session.sendAudio(Buffer.alloc(3200))
  await session.stop()
  socket.bufferedAmount = 0
  session.sendAudio(Buffer.alloc(3200))
  await vi.advanceTimersByTimeAsync(60000)
  expect(sent(socket)).toEqual([])
  expect(onTranscript).not.toHaveBeenCalled()
})
