import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeepgramSession } from './deepgram-session'
import type { SttSessionOptions, SttSignal, SttTranscript } from '../types'

// A fake WebSocket: no network. Tests drive open/message/close by hand.
type Listener = (ev: unknown) => void

class FakeSocket {
  static OPEN = 1
  static instances: FakeSocket[] = []
  readyState = 0
  sent: unknown[] = []
  closes: [number | undefined, string | undefined][] = []
  private listeners = new Map<string, Listener[]>()

  constructor(
    public url: string,
    public protocols: string[],
  ) {
    FakeSocket.instances.push(this)
  }

  addEventListener(type: string, fn: Listener, opts?: { once?: boolean }): void {
    const wrapped: Listener = opts?.once
      ? (ev) => {
          this.off(type, wrapped)
          fn(ev)
        }
      : fn
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), wrapped])
  }

  private off(type: string, fn: Listener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((l) => l !== fn),
    )
  }

  emit(type: string, ev: unknown = {}): void {
    for (const l of this.listeners.get(type) ?? []) l(ev)
  }

  open(): void {
    this.readyState = 1
    this.emit('open')
  }

  send(data: unknown): void {
    this.sent.push(data)
    // Deepgram answers CloseStream by closing normally
    if (data === JSON.stringify({ type: 'CloseStream' })) {
      queueMicrotask(() => this.emit('close', { code: 1000 }))
    }
  }

  close(code?: number, reason?: string): void {
    this.closes.push([code, reason])
    this.readyState = 3
  }

  message(data: unknown): void {
    this.emit('message', { data: JSON.stringify(data) })
  }
}

const sockets = (): FakeSocket[] => FakeSocket.instances
const pcm = (seconds: number, channels = 1): Buffer => Buffer.alloc(seconds * 32000 * channels)
const pcmSent = (s: FakeSocket): number => s.sent.filter((d) => Buffer.isBuffer(d)).length

const final = (text: string, start: number, end: number): unknown => ({
  type: 'Results',
  channel_index: [0, 1],
  is_final: true,
  speech_final: false,
  channel: {
    alternatives: [{ transcript: text, words: [{ word: text, start, end, speaker: 0 }] }],
  },
})

const emptyResults = {
  type: 'Results',
  channel_index: [0, 1],
  is_final: false,
  channel: { alternatives: [{ transcript: '', words: [] }] },
}

interface Rig {
  session: DeepgramSession
  transcripts: SttTranscript[]
  signals: SttSignal[]
  errors: string[]
}

async function connected(extra: Partial<SttSessionOptions> = {}): Promise<Rig> {
  const rig = newRig(extra)
  const connecting = rig.session.connect()
  sockets().at(-1)!.open()
  await connecting
  return rig
}

function newRig(extra: Partial<SttSessionOptions> = {}): Rig {
  const transcripts: SttTranscript[] = []
  const signals: SttSignal[] = []
  const errors: string[] = []
  const session = new DeepgramSession({
    apiKey: 'dg_test',
    channels: 1,
    keyterms: ['Sanas'],
    onTranscript: (t) => transcripts.push(t),
    onSignal: (s) => signals.push(s),
    onError: (m) => errors.push(m),
    ...extra,
  })
  return { session, transcripts, signals, errors }
}

/** Wait out a backoff and open the socket the session creates for it. */
async function reconnectAfter(ms: number): Promise<FakeSocket> {
  await vi.advanceTimersByTimeAsync(ms)
  const s = sockets().at(-1)!
  s.open()
  await vi.advanceTimersByTimeAsync(0)
  return s
}

/** Send a 100 ms PCM chunk every 100 ms for `ms` of fake time. */
async function stream(
  session: DeepgramSession,
  ms: number,
  each?: (i: number) => void,
): Promise<void> {
  for (let i = 0; i < ms / 100; i++) {
    session.sendAudio(pcm(0.1))
    each?.(i)
    await vi.advanceTimersByTimeAsync(100)
  }
}

describe('Deepgram session', () => {
  beforeEach(() => {
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('authenticates through the subprotocol header', async () => {
    const { session } = await connected()
    expect(sockets()[0].protocols).toEqual(['token', 'dg_test'])
    await session.stop()
  })

  describe('audio clock', () => {
    it('stamps a reconnected socket from the PCM cursor, counting audio dropped in backoff', async () => {
      const { session, transcripts, signals } = await connected()
      const first = sockets()[0]
      session.sendAudio(pcm(1))
      first.message(final('Hello.', 0, 0.5))
      first.emit('close', { code: 1006 })
      expect(signals).toEqual([{ kind: 'reset' }])
      expect(sockets()).toHaveLength(1) // still in backoff

      session.sendAudio(pcm(2)) // dropped, but the recording clock still counted it
      const second = await reconnectAfter(1000)
      session.sendAudio(pcm(0.5))
      second.message(final('Again.', 0, 0.4))
      expect(transcripts.map((t) => [t.text, t.tStartMs])).toEqual([
        ['Hello.', 0],
        ['Again.', 3000],
      ])
      await session.stop()
    })

    it('counts bytes per channel: 64000 bytes is one second in stereo', async () => {
      const { session, transcripts } = await connected({ channels: 2 })
      session.sendAudio(pcm(1, 2))
      sockets()[0].emit('close', { code: 1006 })
      session.sendAudio(pcm(1, 2))
      const second = await reconnectAfter(1000)
      session.sendAudio(pcm(0.5, 2))
      second.message(final('Stereo.', 0, 0.4))
      expect(transcripts[0].tStartMs).toBe(2000)
      await session.stop()
    })

    it('does not depend on when the last final landed', async () => {
      const { session, transcripts } = await connected()
      const first = sockets()[0]
      session.sendAudio(pcm(1))
      first.message(final('Early.', 0, 0.5))
      await vi.advanceTimersByTimeAsync(30_000) // long silence, no audio
      first.emit('close', { code: 1006 })
      const second = await reconnectAfter(1000)
      session.sendAudio(pcm(0.5))
      second.message(final('Late.', 0, 0.4))
      expect(transcripts.map((t) => t.tStartMs)).toEqual([0, 1000])
      await session.stop()
    })

    it('freezes the offset at the first chunk sent, not at open or after a wait', async () => {
      const rig = newRig()
      rig.session.sendAudio(pcm(2)) // no socket yet: dropped, but the recording clock counts it
      const connecting = rig.session.connect()
      sockets()[0].open()
      await connecting
      await vi.advanceTimersByTimeAsync(1500) // socket open, no PCM yet
      rig.session.sendAudio(pcm(0.5))
      rig.session.sendAudio(pcm(1)) // later chunks must not move the offset
      sockets()[0].message(final('Hi.', 0, 0.4))
      expect(rig.transcripts[0].tStartMs).toBe(2000)
      await rig.session.stop()
    })

    it('accumulates across several reconnects and honours a resumed start offset', async () => {
      const { session, transcripts } = await connected({ startOffsetMs: 60_000 })
      session.sendAudio(pcm(1))
      sockets()[0].message(final('One.', 0, 0.5))
      sockets()[0].emit('close', { code: 1006 })
      const second = await reconnectAfter(1000)
      session.sendAudio(pcm(1))
      second.emit('close', { code: 1006 })
      const third = await reconnectAfter(1000)
      session.sendAudio(pcm(1))
      third.message(final('Three.', 0, 0.5))
      expect(transcripts.map((t) => t.tStartMs)).toEqual([60_000, 62_000])
      await session.stop()
    })

    it('applies the offset to interims, endpoints and VAD alike', async () => {
      const { session, transcripts, signals } = await connected()
      session.sendAudio(pcm(4))
      sockets()[0].emit('close', { code: 1006 })
      signals.length = 0
      const second = await reconnectAfter(1000)
      session.sendAudio(pcm(0.1))
      second.message({ type: 'SpeechStarted', channel: [0], timestamp: 0.5 })
      second.message({
        ...(final('Yes.', 1, 1.5) as object),
        is_final: false,
      })
      expect(signals[0]).toMatchObject({ kind: 'activity', atMs: 4500 })
      expect(transcripts[0]).toMatchObject({ isFinal: false, tStartMs: 5000, tEndMs: 5500 })
      await session.stop()
    })
  })

  describe('recovery', () => {
    it('ignores everything a retired socket delivers and resets once', async () => {
      const { session, transcripts, signals } = await connected()
      const first = sockets()[0]
      first.emit('close', { code: 1006 })
      first.message(final('Late.', 0, 0.5))
      first.emit('close', { code: 1006 })
      expect(transcripts).toEqual([])
      expect(signals).toEqual([{ kind: 'reset' }])
      await vi.advanceTimersByTimeAsync(1000)
      expect(sockets()).toHaveLength(2) // exactly one recovery
      await session.stop()
    })

    it('reports one error when every retry fails', async () => {
      const { errors, signals } = await connected()
      sockets()[0].emit('close', { code: 1006 })
      for (const [i, delay] of [1000, 2000, 4000, 8000, 8000].entries()) {
        await vi.advanceTimersByTimeAsync(delay)
        expect(sockets()).toHaveLength(i + 2)
        sockets().at(-1)!.emit('error')
        await vi.advanceTimersByTimeAsync(0)
      }
      expect(errors).toEqual(['Deepgram connection lost (close 1006) — reconnect failed'])
      expect(signals).toEqual([{ kind: 'reset' }])
      await vi.advanceTimersByTimeAsync(60_000)
      expect(sockets()).toHaveLength(6)
    })

    it('closes and gives up on a socket that never opens', async () => {
      const { session } = newRig()
      const rejected = expect(session.connect()).rejects.toThrow(/connection failed/)
      await vi.advanceTimersByTimeAsync(10_000)
      await rejected
      expect(sockets()[0].closes).toHaveLength(1)
    })
  })

  describe('stop', () => {
    it('does not report reset for a deliberate stop', async () => {
      const { session, signals } = await connected()
      const stopping = session.stop()
      sockets()[0].emit('close', { code: 1000 })
      await stopping
      expect(signals).toEqual([])
    })

    it('during backoff never opens another socket or reports an error', async () => {
      const { session, errors } = await connected()
      sockets()[0].emit('close', { code: 1006 })
      await session.stop()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(sockets()).toHaveLength(1)
      expect(errors).toEqual([])
    })

    it('while a connect is pending closes the socket that opens later', async () => {
      const { session } = newRig()
      const connecting = session.connect()
      await session.stop()
      sockets()[0].open()
      await connecting
      expect(sockets()[0].closes).toHaveLength(1)
      session.sendAudio(pcm(1))
      expect(pcmSent(sockets()[0])).toBe(0)
    })

    it('while a reconnect is pending closes that socket and tries no more', async () => {
      const { session, errors } = await connected()
      sockets()[0].emit('close', { code: 1006 })
      await vi.advanceTimersByTimeAsync(1000)
      await session.stop()
      sockets()[1].open()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(sockets()[1].closes).toHaveLength(1)
      expect(sockets()).toHaveLength(2)
      expect(errors).toEqual([])
    })
  })

  describe('a transport whose send() throws synchronously', () => {
    it('is contained in sendAudio and recovers like a dead socket', async () => {
      const { session, signals } = await connected()
      const first = sockets()[0]
      first.send = () => {
        throw new Error('write after end')
      }
      expect(() => session.sendAudio(pcm(0.1))).not.toThrow()
      expect(signals).toEqual([{ kind: 'reset' }])
      expect(first.closes).toEqual([[4000, 'send failed']])
      await vi.advanceTimersByTimeAsync(1000)
      expect(sockets()).toHaveLength(2)
      await session.stop()
    })

    it('is contained in the keepalive timer', async () => {
      const { session, signals } = await connected()
      sockets()[0].send = () => {
        throw new Error('write after end')
      }
      await expect(vi.advanceTimersByTimeAsync(10_000)).resolves.not.toThrow()
      expect(signals).toEqual([{ kind: 'reset' }])
      await session.stop()
    })

    it('does not fail stop() when CloseStream cannot be sent', async () => {
      const { session } = await connected()
      const first = sockets()[0]
      first.send = () => {
        throw new Error('write after end')
      }
      await expect(session.stop()).resolves.toBeUndefined()
      expect(first.closes).toHaveLength(1)
    })
  })

  describe('result-stall watchdog', () => {
    it('recovers a socket that stops answering while PCM flows', async () => {
      const { session, signals } = await connected()
      const first = sockets()[0]
      await stream(session, 9_500)
      expect(signals).toEqual([{ kind: 'reset' }])
      expect(first.closes).toEqual([[4000, 'stalled']])
      first.emit('close', { code: 4000 }) // our own close arriving late: ignored
      expect(sockets()).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(1000)
      expect(sockets()).toHaveLength(2)
      expect(signals).toEqual([{ kind: 'reset' }])
      await session.stop()
    })

    it('reports a stalled error once retries run out', async () => {
      const { session, errors } = await connected()
      await stream(session, 9_500)
      for (const delay of [1000, 2000, 4000, 8000, 8000]) {
        await vi.advanceTimersByTimeAsync(delay)
        sockets().at(-1)!.emit('error')
        await vi.advanceTimersByTimeAsync(0)
      }
      expect(errors).toEqual(['Deepgram connection lost (stalled) — reconnect failed'])
      await session.stop()
    })

    it('stays quiet while even empty Results keep arriving', async () => {
      const { session, signals } = await connected()
      await stream(session, 30_000, (i) => {
        if (i % 20 === 0) sockets()[0].message(emptyResults)
      })
      expect(signals).toEqual([])
      await session.stop()
    })

    it('stays quiet with no audio at all', async () => {
      const { session, signals } = await connected()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(signals).toEqual([])
      await session.stop()
    })

    it('gives audio resuming after a capture gap a fresh window', async () => {
      const { session, signals } = await connected()
      await stream(session, 1_000)
      await vi.advanceTimersByTimeAsync(5_000) // capture inactive
      await stream(session, 8_500)
      expect(signals).toEqual([])
      await stream(session, 1_500)
      expect(signals).toEqual([{ kind: 'reset' }])
      await session.stop()
    })

    it('does not count Metadata or KeepAlive-style messages as results', async () => {
      const { session, signals } = await connected()
      await stream(session, 9_500, (i) => {
        if (i % 10 === 0) {
          sockets()[0].message({ type: 'Metadata' })
          sockets()[0].message({ type: 'KeepAlive' })
          sockets()[0].emit('message', { data: 'not json' })
        }
      })
      expect(signals).toEqual([{ kind: 'reset' }])
      await session.stop()
    })
  })
})
