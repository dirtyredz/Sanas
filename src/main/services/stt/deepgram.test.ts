import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deepgramProvider } from './deepgram'
import type { SttSignal, SttTranscript } from './types'

// A fake WebSocket: no network. Tests drive open/message/close by hand.
type Listener = (ev: unknown) => void

class FakeSocket {
  static OPEN = 1
  static instances: FakeSocket[] = []
  readyState = 0
  sent: unknown[] = []
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

  message(data: unknown): void {
    this.emit('message', { data: JSON.stringify(data) })
  }
}

const final = (text: string, start: number, end: number): unknown => ({
  type: 'Results',
  channel_index: [0, 1],
  is_final: true,
  speech_final: false,
  channel: {
    alternatives: [{ transcript: text, words: [{ word: text, start, end, speaker: 0 }] }],
  },
})

async function openSession(
  transcripts: SttTranscript[],
  signals: SttSignal[],
  errors: string[] = [],
): Promise<{ stop: () => Promise<void> }> {
  const started = deepgramProvider.start({
    apiKey: 'dg_test',
    channels: 1,
    keyterms: ['Sanas'],
    onTranscript: (t) => transcripts.push(t),
    onSignal: (s) => signals.push(s),
    onError: (m) => errors.push(m),
  })
  FakeSocket.instances[FakeSocket.instances.length - 1].open()
  return started
}

describe('Deepgram streaming session', () => {
  beforeEach(() => {
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('asks for endpointing, utterance ends and VAD events alongside the existing options', async () => {
    const session = await openSession([], [])
    const url = new URL(FakeSocket.instances[0].url)
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      model: 'nova-3',
      diarize: 'true',
      interim_results: 'true',
      smart_format: 'true',
      multichannel: 'false',
      endpointing: '600',
      utterance_end_ms: '1000',
      vad_events: 'true',
      keyterm: 'Sanas',
    })
    expect(FakeSocket.instances[0].protocols).toEqual(['token', 'dg_test'])
    await session.stop()
  })

  it('reports reset as soon as the socket drops, before reconnecting', async () => {
    const transcripts: SttTranscript[] = []
    const signals: SttSignal[] = []
    const session = await openSession(transcripts, signals)
    const first = FakeSocket.instances[0]
    first.message(final('Hello.', 0, 0.5))
    first.emit('close', { code: 1006 })

    expect(signals).toEqual([{ kind: 'reset' }])
    expect(FakeSocket.instances).toHaveLength(1) // still in backoff

    await vi.advanceTimersByTimeAsync(1000)
    expect(FakeSocket.instances).toHaveLength(2)
    const second = FakeSocket.instances[1]
    second.open()
    await vi.advanceTimersByTimeAsync(0)
    // the new connection's clock continues from the last final word
    second.message(final('Again.', 0, 0.4))
    expect(transcripts.map((t) => [t.text, t.tStartMs])).toEqual([
      ['Hello.', 0],
      ['Again.', 500],
    ])
    await session.stop()
  })

  it('ignores anything a retired socket still delivers', async () => {
    const transcripts: SttTranscript[] = []
    const signals: SttSignal[] = []
    const session = await openSession(transcripts, signals)
    const first = FakeSocket.instances[0]
    first.emit('close', { code: 1006 })
    first.message(final('Late.', 0, 0.5))
    first.emit('close', { code: 1006 }) // a second close from the same dead socket

    expect(transcripts).toEqual([])
    expect(signals).toEqual([{ kind: 'reset' }])
    await session.stop()
  })

  it('does not report reset for a deliberate stop', async () => {
    const signals: SttSignal[] = []
    const session = await openSession([], signals)
    const stopping = session.stop()
    FakeSocket.instances[0].emit('close', { code: 1000 })
    await stopping
    expect(signals).toEqual([])
  })
})
