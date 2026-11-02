import { afterEach, expect, it, vi } from 'vitest'
import { RehearsalAssistant } from './providers'
import { publicOutcome } from './outcomes'
import { evaluate } from './assertions'
import type { AssistRequest } from '../services/assistant/types'
import type { Scenario } from './scenario'

const req: AssistRequest = {
  apiKey: 'secret',
  system: '',
  userContent: '',
  model: '',
  maxTokens: 50,
  effort: 'low',
  diagnostic: { purpose: 'answer', turns: [{ startMs: 0, endMs: 3000, completedAt: 3350 }] },
}
const scenario: Scenario = {
  version: 1,
  name: 'Coverage',
  durationMs: 10000,
  steps: ['date', 'owner', 'budget'].map((id, i) => ({
    id,
    kind: 'utterance',
    channel: 'them',
    speaker: 1,
    text: id + '?',
    atMs: i * 1000,
    durationMs: 900,
  })),
  expectations: [
    { id: 'requested', kind: 'request', covers: ['date', 'owner', 'budget'] },
    { id: 'date', kind: 'suggestion', covers: ['date'], rubric: 'date' },
    { id: 'owner', kind: 'suggestion', covers: ['owner'], rubric: 'owner' },
    { id: 'budget', kind: 'suggestion', covers: ['budget'], rubric: 'budget' },
  ],
}
afterEach(() => vi.useRealTimers())
it('keeps missing-output reasons distinct and never accepts a failed request as an answer', async () => {
  const model = new RehearsalAssistant(() => 4000, { complete: async () => 'date' }, scenario.steps)
  await model.complete(req)
  const check = () => evaluate(scenario, [], new Map(), 'claude', model.requests)[1]
  expect(check().reason).toContain('Wrong-content or undelivered')
  for (const [status, reason] of [
    ['declined', 'Declined'],
    ['failed', 'Failed/cancelled'],
    ['cancelled', 'Failed/cancelled'],
  ] as const) {
    model.requests[0].status = status
    expect(check()).toMatchObject({ passed: false })
    expect(check().reason).toContain(reason)
  }
  model.requests[0].pendingAtStop = true
  expect(check().reason).toContain('Pending-at-stop')
  model.requests.length = 0
  expect(check().reason).toContain('Never-requested')
})
it('keeps overlapping manual actions correlated across acquisition awaits', async () => {
  const model = new RehearsalAssistant(() => 0)
  let resume!: () => void
  const paused = new Promise<void>((resolve) => {
    resume = resolve
  })
  const first = model.withAction('screen', async () => {
    await paused
    await model.complete({ ...req, diagnostic: { purpose: 'answer', manualKind: 'capture' } })
  })
  await model.withAction('ask', () =>
    model.complete({ ...req, diagnostic: { purpose: 'answer', manualKind: 'typed' } }),
  )
  resume()
  await first
  expect(model.requests.map((r) => r.stepIds)).toEqual([['ask'], ['screen']])
})
it('does not equate outgoing coverage with useful answers or unrelated output', async () => {
  const model = new RehearsalAssistant(
    () => 4000,
    { complete: async () => 'Delivery date unknown.' },
    scenario.steps,
  )
  await model.complete(req)
  const evidence = [
    { kind: 'request' as const, atMs: 4000, requestId: 1 },
    { kind: 'suggestion' as const, atMs: 4000, requestId: 1, text: 'Delivery date unknown.' },
  ]
  expect(
    evaluate(scenario, evidence, new Map(), 'claude', model.requests).map((c) => c.passed),
  ).toEqual([true, true, false, false])
  expect(
    evaluate(scenario, [evidence[0]], new Map(), 'claude', model.requests).map((c) => c.passed),
  ).toEqual([true, false, false, false])
  expect(
    evaluate(
      scenario,
      [{ ...evidence[1], requestId: 999, text: 'date owner budget' }],
      new Map(),
      'claude',
      model.requests,
    ).every((c) => !c.passed),
  ).toBe(true)
})
it('records dispatch, first delta, completion, decline and errors independently without secrets', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const model = new RehearsalAssistant(Date.now, {
    complete: async (r) => {
      await new Promise((resolve) => setTimeout(resolve, 100))
      r.onDelta?.('Lead')
      await new Promise((resolve) => setTimeout(resolve, 900))
      return 'Lead'
    },
  })
  const call = model.complete({ ...req, onDelta: () => {} })
  expect(model.requests[0]).toMatchObject({ atMs: 0, status: 'pending' })
  await vi.advanceTimersByTimeAsync(100)
  expect(model.requests[0]).toMatchObject({ firstDeltaMs: 100, status: 'pending' })
  await vi.advanceTimersByTimeAsync(900)
  await call
  expect(model.requests[0]).toMatchObject({ completedMs: 1000, status: 'completed' })
  expect(JSON.stringify(publicOutcome(model.requests[0]))).not.toContain('secret')
  const noop = new RehearsalAssistant(Date.now, { complete: async () => '<none>' })
  await noop.complete(req)
  expect(noop.requests[0].status).toBe('declined')
  const fail = new RehearsalAssistant(Date.now, {
    complete: async () => {
      throw new Error('secret')
    },
  })
  await expect(fail.complete(req)).rejects.toThrow('failed')
  expect(fail.requests[0].status).toBe('failed')
})
it('reports delivered-late separately from the first-output responsiveness target', async () => {
  const model = new RehearsalAssistant(() => 1000, { complete: async () => 'date' }, scenario.steps)
  await model.complete(req)
  Object.assign(model.requests[0], { firstVisibleMs: 100, completedMs: 1000, deliveredMs: 1000 })
  const check = evaluate(
    {
      ...scenario,
      expectations: [
        {
          id: 'timing',
          kind: 'suggestion',
          after: 'date',
          covers: ['date'],
          withinMs: 500,
          responsivenessMs: 200,
        },
      ],
    },
    [{ kind: 'suggestion', atMs: 1000, requestId: 1, text: 'date' }],
    new Map([['date', 0]]),
    'claude',
    model.requests,
  )[0]
  expect(check).toMatchObject({
    passed: false,
    responsive: true,
    firstOutputLatencyMs: 100,
    completionLatencyMs: 1000,
  })
  expect(check.reason).toContain('Delivered-late')
})
