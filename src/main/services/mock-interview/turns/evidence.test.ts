import { expect, it } from 'vitest'
import { MockEvidence } from './evidence'

it('transport and renderer evidence never settle a practice answer', () => {
  const evidence = new MockEvidence(() => 123)
  evidence.run({
    kind: 'begin',
    id: 1,
    meetingId: 1,
    purpose: 'answer',
    trigger: 'ambient',
    spans: [],
    at: 0,
  })
  evidence.run({ kind: 'provider', id: 1, meetingId: 1, timing: { kind: 'first-protocol', at: 2 } })
  evidence.run({ kind: 'renderer', id: 1, meetingId: 1, state: 'unselected', at: 3 })
  expect(evidence.requests[0]).toMatchObject({ status: 'pending' })
  expect(evidence.requests[0].completedMs).toBeUndefined()
  evidence.run({ kind: 'settled', id: 1, meetingId: 1, outcome: 'done', at: 4 })
  expect(evidence.requests[0]).toMatchObject({ status: 'completed', completedMs: 123 })
})

const speculativeBegin = (id: number) =>
  ({
    kind: 'begin',
    id,
    meetingId: 1,
    purpose: 'answer',
    trigger: 'ambient',
    spans: [],
    speculative: true,
    at: 0,
  }) as const

it('records a speculative answer only once it is promoted', () => {
  const evidence = new MockEvidence(() => 5)
  evidence.run(speculativeBegin(1))
  evidence.run({ kind: 'first-text', id: 1, meetingId: 1, at: 1 })
  expect(evidence.requests).toEqual([])
  evidence.run({ kind: 'promoted', id: 1, meetingId: 1, at: 2 })
  expect(evidence.requests[0]).toMatchObject({ id: 1, status: 'pending', firstDeltaMs: 5 })
  evidence.run({ kind: 'settled', id: 1, meetingId: 1, outcome: 'done', at: 3 })
  expect(evidence.requests[0]).toMatchObject({ status: 'completed' })
})

it('never reports a discarded speculative answer', () => {
  const evidence = new MockEvidence(() => 5)
  evidence.run(speculativeBegin(1))
  evidence.run({ kind: 'settled', id: 1, meetingId: 1, outcome: 'discarded', at: 3 })
  expect(evidence.requests).toEqual([])
})
