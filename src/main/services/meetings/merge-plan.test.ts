import { describe, expect, it } from 'vitest'
import { planMerge, type MergePart } from './merge-plan'

const part = (o: Partial<MergePart> & Pick<MergePart, 'id' | 'startedAt'>): MergePart => ({
  jobId: 1,
  endedAt: '2026-09-09 21:00:00',
  summary: null,
  actionItems: null,
  maxSpeaker: -1,
  ...o,
})

// the real case this was written for: one call, three rows
const a = part({
  id: 13,
  startedAt: '2026-09-09 20:45:57',
  endedAt: '2026-09-09 20:50:39',
  maxSpeaker: 4,
  summary: 'First stretch.',
})
const b = part({
  id: 14,
  startedAt: '2026-09-09 20:50:49',
  endedAt: '2026-09-09 20:51:03',
  maxSpeaker: 0,
  summary: 'Fragment.',
})
const c = part({
  id: 15,
  startedAt: '2026-09-09 20:51:49',
  endedAt: '2026-09-09 21:18:13',
  maxSpeaker: 4,
  summary: 'Last stretch.',
})

describe('planMerge', () => {
  it('keeps the earliest meeting and offsets the rest by the real gap', () => {
    const plan = planMerge([c, a, b]) // deliberately out of order
    expect(plan.keepId).toBe(13)
    expect(plan.steps).toEqual([
      { from: 14, timeOffsetMs: 292_000, speakerOffset: 5 },
      { from: 15, timeOffsetMs: 352_000, speakerOffset: 6 },
    ])
    expect(plan.endedAt).toBe('2026-09-09 21:18:13')
  })

  it('gives each part its own speaker block so voices are never conflated', () => {
    const plan = planMerge([a, c])
    expect(plan.steps[0].speakerOffset).toBe(5) // a used 0..4
  })

  it('treats a meeting with no diarized speakers as taking no block', () => {
    const silent = part({ id: 20, startedAt: '2026-09-09 20:46:00', maxSpeaker: -1 })
    const plan = planMerge([a, silent, c])
    expect(plan.steps).toEqual([
      { from: 20, timeOffsetMs: 3_000, speakerOffset: 5 },
      { from: 15, timeOffsetMs: 352_000, speakerOffset: 5 },
    ])
  })

  it('labels each part when joining summaries, and leaves a lone one alone', () => {
    expect(planMerge([a, b, c]).summary).toBe(
      '[part 20:45] First stretch.\n\n[part 20:50] Fragment.\n\n[part 20:51] Last stretch.',
    )
    expect(planMerge([a, part({ id: 21, startedAt: '2026-09-09 20:52:00' })]).summary).toBe(
      'First stretch.',
    )
    expect(
      planMerge([part({ id: 22, startedAt: '2026-09-09 20:52:00' }), b]).actionItems,
    ).toBeNull()
  })

  it('refuses what it cannot merge honestly', () => {
    expect(() => planMerge([a])).toThrow('at least two')
    expect(() => planMerge([a, a])).toThrow('listed twice')
    expect(() => planMerge([a, { ...c, jobId: 2 }])).toThrow('different jobs')
    expect(() => planMerge([a, { ...c, endedAt: null }])).toThrow('never ended')
  })
})
