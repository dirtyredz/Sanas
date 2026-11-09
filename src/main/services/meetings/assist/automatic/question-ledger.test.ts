import { describe, expect, it } from 'vitest'
import type { CompletedTurn } from '../../../turns/types'
import { QUESTION_CARRY_CAP, QUESTION_CARRY_WINDOW_MS, QuestionLedger } from './question-ledger'

function turn(text: string, completedAt: number): CompletedTurn {
  return {
    text,
    completedAt,
    startMs: completedAt,
    endMs: completedAt + 500,
    role: 'other',
  } as CompletedTurn
}

describe('QuestionLedger', () => {
  it('carries overtaken questions into the newest, oldest first', () => {
    const l = new QuestionLedger()
    const [a, b, c] = [turn('a?', 0), turn('b?', 1000), turn('c?', 2000)]
    for (const t of [a, b, c]) l.record(t, t.completedAt)
    expect(l.select(2000)).toEqual([a, b, c])
  })

  it('caps the set at the newest questions', () => {
    const l = new QuestionLedger()
    const all = [0, 1, 2, 3, 4].map((i) => turn(`q${i}?`, i * 1000))
    for (const t of all) l.record(t, t.completedAt)
    const picked = l.select(4000)
    expect(picked).toHaveLength(QUESTION_CARRY_CAP)
    expect(picked).toEqual(all.slice(-QUESTION_CARRY_CAP))
  })

  it('does not re-ask covered questions, nor older ones beyond the cap', () => {
    const l = new QuestionLedger()
    const all = [0, 1, 2, 3].map((i) => turn(`q${i}?`, i * 1000))
    for (const t of all) l.record(t, t.completedAt)
    l.cover(l.select(3000))
    expect(l.select(3000)).toEqual([])
    const next = turn('later?', 4000)
    l.record(next, 4000)
    expect(l.select(4000)).toEqual([next])
  })

  it('ages questions out of the window and clears on demand', () => {
    const l = new QuestionLedger()
    const old = turn('old?', 0)
    const fresh = turn('fresh?', QUESTION_CARRY_WINDOW_MS + 1)
    l.record(old, 0)
    l.record(fresh, fresh.completedAt)
    expect(l.select(fresh.completedAt)).toEqual([fresh])
    l.clear()
    expect(l.select(fresh.completedAt)).toEqual([])
  })

  it('records a turn once', () => {
    const l = new QuestionLedger()
    const a = turn('a?', 0)
    l.record(a, 0)
    l.record(a, 10)
    expect(l.select(10)).toEqual([a])
  })
})
