import { describe, expect, it } from 'vitest'
import { ShownLedger } from './shown-ledger'

describe('ShownLedger', () => {
  it('routes each purpose into the memories it belongs to', () => {
    const ledger = new ShownLedger()
    ledger.record({ text: '**Answer one.**\nDetail one.', purpose: 'answer' })
    ledger.record({ text: '**Typed ask.**', purpose: 'answer', manualKind: 'typed' })
    ledger.record({ text: '**Screen answer.**', purpose: 'answer', manualKind: 'capture' })
    ledger.record({ text: '**Next point.**', purpose: 'next-point' })
    const s = ledger.snapshot()
    expect(s.recent).toEqual(['Typed ask.', 'Screen answer.', 'Next point.']) // last 3 headlines
    expect(s.told.map((t) => t.headline)).toEqual(['Answer one.', 'Typed ask.'])
    expect(s.coachRecent).toEqual(['Next point.'])
  })

  it('snapshots are copies; clearCoach and reset restart the right lists', () => {
    const ledger = new ShownLedger()
    ledger.record({ text: '**A next point.**', purpose: 'next-point' })
    ledger.record({ text: '**An answer.**', purpose: 'answer' })
    const before = ledger.snapshot()
    ledger.record({ text: '**Later.**', purpose: 'next-point' })
    expect(before.coachRecent).toEqual(['A next point.'])
    ledger.clearCoach()
    expect(ledger.snapshot().coachRecent).toEqual([])
    expect(ledger.snapshot().told).toHaveLength(1)
    ledger.reset()
    expect(ledger.snapshot()).toEqual({ recent: [], told: [], coachRecent: [] })
  })
})
