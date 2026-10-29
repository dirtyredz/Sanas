import { describe, expect, it } from 'vitest'
import { normalizeDeepgramMessage, type DeepgramEvent } from './deepgram-events'

const mono = { channels: 1, offsetMs: 0 }
const stereo = { channels: 2, offsetMs: 0 }

function word(w: string, start: number, end: number, speaker?: number): Record<string, unknown> {
  return { word: w.toLowerCase(), punctuated_word: w, start, end, speaker }
}

function results(o: {
  words?: Record<string, unknown>[]
  transcript?: string
  isFinal?: boolean
  speechFinal?: boolean
  channelIndex?: unknown
  start?: number
  duration?: number
}): string {
  const words = o.words ?? []
  return JSON.stringify({
    type: 'Results',
    channel_index: 'channelIndex' in o ? o.channelIndex : [0, 1],
    is_final: o.isFinal ?? true,
    speech_final: o.speechFinal ?? false,
    start: o.start,
    duration: o.duration,
    channel: {
      alternatives: [
        {
          transcript: o.transcript ?? words.map((w) => w.punctuated_word).join(' '),
          words,
        },
      ],
    },
  })
}

const kinds = (events: DeepgramEvent[]): string[] =>
  events.map((e) => (e.type === 'transcript' ? 'transcript' : e.signal.kind))

describe('Deepgram message normalization', () => {
  it('delivers every speaker run of a mixed-speaker final before one boundary', () => {
    const out = normalizeDeepgramMessage(
      results({
        words: [
          word('Sounds', 0.1, 0.4, 0),
          word('good.', 0.4, 0.7, 0),
          word('How', 1.0, 1.2, 1),
          word('so?', 1.2, 1.5, 1),
        ],
        speechFinal: true,
      }),
      mono,
    )
    expect(kinds(out.events)).toEqual(['transcript', 'transcript', 'boundary'])
    const [a, b, boundary] = out.events
    expect(a).toMatchObject({ transcript: { speaker: 0, text: 'Sounds good.', tEndMs: 700 } })
    expect(b).toMatchObject({ transcript: { speaker: 1, text: 'How so?', tStartMs: 1000 } })
    expect(boundary).toMatchObject({
      signal: { kind: 'boundary', channel: 0, atMs: 1500, source: 'endpoint' },
    })
    expect(out.finalEndMs).toBe(1500)
  })

  it('keeps the endpoint of an empty speech_final', () => {
    const out = normalizeDeepgramMessage(
      results({ transcript: '', speechFinal: true, start: 4, duration: 0.5 }),
      mono,
    )
    expect(out.events).toEqual([
      {
        type: 'signal',
        signal: { kind: 'boundary', channel: 0, atMs: 4500, source: 'endpoint' },
      },
    ])
  })

  it('reads Results channel_index and UtteranceEnd channel separately', () => {
    const r = normalizeDeepgramMessage(
      results({ words: [word('Hi.', 0, 0.3)], channelIndex: [1, 2] }),
      stereo,
    )
    expect(r.events[0]).toMatchObject({ transcript: { channel: 1 } })
    const u = normalizeDeepgramMessage(
      JSON.stringify({ type: 'UtteranceEnd', channel: [1, 2], last_word_end: 2.5 }),
      stereo,
    )
    expect(u.events).toEqual([
      {
        type: 'signal',
        signal: { kind: 'boundary', channel: 1, atMs: 2500, source: 'utterance-end' },
      },
    ])
  })

  it('applies the connection offset to words, boundaries and activity', () => {
    const ctx = { channels: 1, offsetMs: 60_000 }
    const out = normalizeDeepgramMessage(
      results({ words: [word('Next.', 1, 1.5, 0)], speechFinal: true }),
      ctx,
    )
    expect(out.events[0]).toMatchObject({ transcript: { tStartMs: 61_000, tEndMs: 61_500 } })
    expect(out.events[1]).toMatchObject({ signal: { atMs: 61_500 } })
    const vad = normalizeDeepgramMessage(
      JSON.stringify({ type: 'SpeechStarted', channel: [0], timestamp: 2 }),
      ctx,
    )
    expect(vad.events).toEqual([
      { type: 'signal', signal: { kind: 'activity', channel: 0, atMs: 62_000 } },
    ])
  })

  it('rejects UtteranceEnd with last_word_end -1 before applying the offset', () => {
    const out = normalizeDeepgramMessage(
      JSON.stringify({ type: 'UtteranceEnd', channel: [0, 1], last_word_end: -1 }),
      { channels: 1, offsetMs: 10_000 },
    )
    expect(out.events).toEqual([])
  })

  it('turns an interim into a transcript plus channel activity, never a boundary', () => {
    const out = normalizeDeepgramMessage(
      results({ words: [word('How', 0.2, 0.4, 1)], isFinal: false, speechFinal: true }),
      mono,
    )
    expect(kinds(out.events)).toEqual(['transcript', 'activity'])
    expect(out.events[0]).toMatchObject({ transcript: { isFinal: false } })
    expect(out.finalEndMs).toBeNull()
  })

  it('keeps a wordless final with result-level timing and unknown speaker', () => {
    const out = normalizeDeepgramMessage(
      results({ transcript: 'Okay.', words: [], start: 3, duration: 1 }),
      mono,
    )
    expect(out.events).toEqual([
      {
        type: 'transcript',
        transcript: {
          isFinal: true,
          channel: 0,
          speaker: -1,
          tStartMs: 3000,
          tEndMs: 4000,
          text: 'Okay.',
        },
      },
    ])
  })

  it('marks a stereo message without a valid channel index as unknown, not the user', () => {
    for (const channelIndex of [undefined, [], [5, 2], ['0', 2], [-1, 2]]) {
      const out = normalizeDeepgramMessage(
        results({ words: [word('Hello.', 0, 0.4, 0)], channelIndex }),
        stereo,
      )
      expect(out.events[0]).toMatchObject({ transcript: { channel: -1 } })
      expect(out.invalidChannel).toBe(true)
    }
  })

  it('lets mono omit the channel index', () => {
    const out = normalizeDeepgramMessage(
      results({ words: [word('Hello.', 0, 0.4, 0)], channelIndex: undefined }),
      mono,
    )
    expect(out.events[0]).toMatchObject({ transcript: { channel: 0 } })
  })

  it('ignores malformed messages without throwing', () => {
    for (const raw of [
      'not json',
      'null',
      '42',
      JSON.stringify({ type: 'Results' }),
      JSON.stringify({ type: 'Results', channel: { alternatives: 'x' } }),
      JSON.stringify({ type: 'UtteranceEnd', channel: [0], last_word_end: 'soon' }),
      JSON.stringify({ type: 'SpeechStarted', timestamp: null }),
      JSON.stringify({ type: 'Metadata' }),
    ]) {
      expect(() => normalizeDeepgramMessage(raw, mono)).not.toThrow()
      expect(normalizeDeepgramMessage(raw, mono).events).toEqual([])
    }
    const badWords = normalizeDeepgramMessage(
      results({ transcript: 'Hi', words: [{ word: 'hi', start: 'x', end: 1 }] }),
      mono,
    )
    expect(badWords.events[0]).toMatchObject({ transcript: { speaker: -1, text: 'Hi' } })
  })
})
