import { describe, expect, it } from 'vitest'
import { ENDPOINTING_MS } from '../stt/endpointing'
import { TurnAssembler, CONTINUATION_GRACE_MS } from './turn-assembler'
import type { CompletedTurn, TurnFinal } from './types'

const final = (text: string, start: number, end: number, channel = 1): TurnFinal => ({
  text,
  tStartMs: start,
  tEndMs: end,
  channel,
  speaker: 1,
  role: 'other',
})

/** Deterministic boundary replay, not evidence of real Deepgram recognition. The second
 *  part starts with activity, before its final arrives, just like streaming STT. */
function replay(endpoint: number, pause: number): CompletedTurn[] {
  const a = new TurnAssembler()
  const turns: CompletedTurn[] = []
  a.final(final('How would you implement this', 0, 1000), 1000)
  if (pause >= endpoint) a.boundary(1, 1000, 'endpoint', 1000 + endpoint)
  turns.push(...a.tick(1000 + pause))
  a.activity(1, 1000 + pause, 1000 + pause)
  turns.push(
    ...a.final(final('and what is its complexity?', 1000 + pause, 2000 + pause), 2000 + pause)
      .completed,
  )
  a.boundary(1, 2000 + pause, 'endpoint', 2000 + pause + endpoint)
  turns.push(...a.tick(2000 + pause + endpoint + CONTINUATION_GRACE_MS))
  return turns
}

describe('endpoint pause replay', () => {
  it.each([200, 300, 450, 600])(
    'keeps both parts and one answer candidate across a %i ms pause',
    (pause) => {
      const turns = replay(ENDPOINTING_MS, pause)
      expect(turns).toHaveLength(1)
      expect(turns[0]).toMatchObject({
        text: 'How would you implement this and what is its complexity?',
        startMs: 0,
        endMs: 2000 + pause,
        fragments: 2,
      })
    },
  )
  it('preserves text coverage but creates two answer candidates after an 800 ms pause', () => {
    const turns = replay(ENDPOINTING_MS, 800)
    expect(turns).toHaveLength(2)
    expect(turns.map((t) => t.text).join(' ')).toBe(
      'How would you implement this and what is its complexity?',
    )
  })
  it.each([300, 450])(
    'rejects %i ms: a 600 ms multipart pause fragments into two candidates',
    (endpoint) => {
      expect(replay(endpoint, 600)).toHaveLength(2)
    },
  )
  it('ignores stale/duplicate boundaries, isolates channels and discards unfinished speech on reconnect', () => {
    const a = new TurnAssembler()
    a.final(final('What is the first answer?', 0, 1000, 0), 1000)
    a.final(final('What is the other answer?', 0, 1100, 1), 1100)
    a.boundary(0, 100, 'endpoint', 1200)
    expect(a.tick(1350)).toEqual([])
    a.boundary(0, 1000, 'endpoint', 1600)
    a.boundary(0, 1000, 'endpoint', 1601)
    expect(a.tick(1750).map((t) => t.text)).toEqual(['What is the first answer?'])
    a.reset()
    a.boundary(1, 1100, 'endpoint', 1800)
    expect(a.tick(2000)).toEqual([])
    a.final(final('What is the fresh answer?', 3000, 4000, 1), 4000)
    a.boundary(1, 4000, 'endpoint', 4600)
    expect(a.tick(4750).map((t) => t.text)).toEqual(['What is the fresh answer?'])
  })
})
