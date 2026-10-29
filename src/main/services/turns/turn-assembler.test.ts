import { describe, expect, it } from 'vitest'
import {
  CONTINUATION_GRACE_MS,
  SILENCE_FALLBACK_MS,
  TURN_TEXT_CAP,
  TurnAssembler,
} from './turn-assembler'
import type { TurnFinal } from './types'

const them = (text: string, tStartMs: number, tEndMs: number, speaker = 1): TurnFinal => ({
  channel: 0,
  speaker,
  role: 'other',
  tStartMs,
  tEndMs,
  text,
})

describe('turn assembly', () => {
  it('joins the fragmented linked-list question into one completed turn', () => {
    const a = new TurnAssembler()
    expect(a.final(them('How do you make', 0, 900), 1_000).completed).toEqual([])
    expect(a.tick(1_200)).toEqual([]) // nothing completes on the first fragment alone
    expect(a.final(them('a linked list?', 1_400, 2_100), 1_500).completed).toEqual([])
    a.boundary(0, 2_100, 'endpoint', 1_600)
    expect(a.tick(1_600 + CONTINUATION_GRACE_MS - 1)).toEqual([])
    const [turn] = a.tick(1_600 + CONTINUATION_GRACE_MS)
    expect(turn).toMatchObject({
      text: 'How do you make a linked list?',
      reason: 'endpoint',
      startMs: 0,
      endMs: 2_100,
      words: 7,
      fragments: 2,
    })
  })

  it('completes without a question mark', () => {
    const a = new TurnAssembler()
    a.final(them('how do you make', 0, 900), 0)
    a.final(them('a linked list', 1_000, 1_800), 200)
    a.boundary(0, 1_800, 'utterance-end', 300)
    expect(a.tick(300 + CONTINUATION_GRACE_MS)[0]).toMatchObject({
      text: 'how do you make a linked list',
      reason: 'utterance-end',
    })
  })

  it('continues the turn when speech resumes inside the grace period', () => {
    const a = new TurnAssembler()
    a.final(them('So the question is', 0, 1_000), 0)
    a.boundary(0, 1_000, 'endpoint', 100)
    a.activity(0, 1_900, 200) // an interim of the next words
    expect(a.tick(100 + CONTINUATION_GRACE_MS)).toEqual([])
    a.final(them('how we ship it?', 1_700, 2_600), 400)
    a.boundary(0, 2_600, 'endpoint', 500)
    expect(a.tick(500 + CONTINUATION_GRACE_MS)[0].text).toBe('So the question is how we ship it?')
  })

  it('emits a turn once however many boundaries repeat', () => {
    const a = new TurnAssembler()
    a.final(them('Any thoughts?', 0, 700), 0)
    a.boundary(0, 700, 'endpoint', 50)
    a.boundary(0, 700, 'utterance-end', 60)
    expect(a.tick(50 + CONTINUATION_GRACE_MS)).toHaveLength(1)
    a.boundary(0, 700, 'utterance-end', 900)
    expect(a.tick(5_000)).toEqual([])
  })

  it('rejects a delayed utterance end that arrives after speech resumed', () => {
    const a = new TurnAssembler()
    a.final(them('Let me explain', 0, 800), 0)
    a.activity(0, 2_500, 900) // speech resumed well past the old word gap
    a.boundary(0, 800, 'utterance-end', 1_000)
    expect(a.tick(1_000 + CONTINUATION_GRACE_MS)).toEqual([])
  })

  it('falls back to silence when no boundary evidence arrives', () => {
    const a = new TurnAssembler()
    a.final(them('What about latency', 0, 1_000), 0)
    a.activity(0, 1_000, 500) // not advancing: same audio time
    expect(a.nextDeadline()).toBe(SILENCE_FALLBACK_MS)
    expect(a.tick(SILENCE_FALLBACK_MS - 1)).toEqual([])
    expect(a.tick(SILENCE_FALLBACK_MS)[0]).toMatchObject({ reason: 'silence' })
    expect(a.nextDeadline()).toBeNull()
  })

  it('assembles stereo channels independently', () => {
    const a = new TurnAssembler()
    a.final({ ...them('Can you share', 0, 600), channel: 1 }, 0)
    a.final({ channel: 0, speaker: -1, role: 'user', tStartMs: 100, tEndMs: 500, text: 'Sure' }, 10)
    a.final({ ...them('the dashboard?', 700, 1_300), channel: 1 }, 20)
    a.boundary(1, 1_300, 'endpoint', 30)
    const done = a.tick(30 + CONTINUATION_GRACE_MS)
    expect(done.map((t) => [t.channel, t.text])).toEqual([[1, 'Can you share the dashboard?']])
  })

  it('closes a turn on a confirmed speaker change in final text', () => {
    const a = new TurnAssembler()
    a.final(them('I think we should wait.', 0, 1_000, 1), 0)
    const closed = a.final(them('Why wait?', 1_200, 1_700, 2), 100).completed
    expect(closed).toHaveLength(1)
    expect(closed[0]).toMatchObject({ speaker: 1, reason: 'speaker-change' })
    // an unknown-identity fragment is not a confirmed change
    expect(
      a.final({ ...them('really', 1_800, 2_000), speaker: -1, role: 'unknown' }, 200).completed,
    ).toEqual([])
    a.boundary(0, 2_000, 'endpoint', 300)
    expect(a.tick(300 + CONTINUATION_GRACE_MS)[0]).toMatchObject({
      speaker: 2,
      text: 'Why wait? really',
    })
  })

  it('drops exact duplicate fragments but keeps repeated words at new times', () => {
    const a = new TurnAssembler()
    a.final(them('no no', 0, 500), 0)
    expect(a.final(them('no no', 0, 500), 10).accepted).toBe(false)
    a.final(them('no no', 600, 1_100), 20)
    a.boundary(0, 1_100, 'endpoint', 30)
    expect(a.tick(30 + CONTINUATION_GRACE_MS)[0]).toMatchObject({
      text: 'no no no no',
      fragments: 2,
    })
  })

  it('bounds retained text, keeping the opening and the recent words', () => {
    const a = new TurnAssembler()
    const piece = 'x'.repeat(99)
    for (let i = 0; i < 200; i++) a.final(them(`${i}:${piece}`, i * 100, i * 100 + 90), i)
    expect(a.tick(199)).toEqual([]) // reaching the bound does not complete the turn
    a.boundary(0, 19_990, 'endpoint', 300)
    const [turn] = a.tick(300 + CONTINUATION_GRACE_MS)
    expect(turn.text.length).toBeLessThanOrEqual(TURN_TEXT_CAP)
    expect(turn.text.startsWith('0:')).toBe(true)
    expect(turn.text).toContain('[…]')
    expect(turn.text.endsWith(`199:${piece}`)).toBe(true)
    expect(turn.fragments).toBe(200)
    expect(turn.words).toBe(200)
  })

  it('discards the unfinished turn on reset and never emits it', () => {
    const a = new TurnAssembler()
    a.final(them('Could you', 0, 500), 0)
    a.boundary(0, 500, 'endpoint', 10)
    a.reset() // pause, stop, reconnect or a pin change
    expect(a.tick(10_000)).toEqual([])
    // the duplicate memory belongs to the old epoch too
    a.final(them('Could you', 0, 500), 20_000)
    expect(a.tick(20_000 + SILENCE_FALLBACK_MS)).toHaveLength(1)
  })
})
