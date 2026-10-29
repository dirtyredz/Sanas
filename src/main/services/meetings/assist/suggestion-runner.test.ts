import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SuggestionEvent } from '@shared/types'
import type { AssistRequest } from '../../assistant/types'
import {
  SuggestionRunner,
  type StoredSuggestion,
  type SuggestionRequest,
} from './suggestion-runner'

interface Pending {
  req: AssistRequest
  resolve: (text: string) => void
  reject: (e: unknown) => void
}

function harness(opts: { persistThrows?: boolean } = {}) {
  const pending: Pending[] = []
  const events: SuggestionEvent[] = []
  const stored: StoredSuggestion[] = []
  const holds = new Map<number, number>()
  const runner = new SuggestionRunner({
    provider: {
      complete: (req) =>
        new Promise<string>((resolve, reject) => {
          pending.push({ req, resolve, reject })
          req.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    },
    emit: (e) => events.push(e),
    persist: (s) => {
      if (opts.persistThrows) throw new Error('disk full')
      stored.push(s)
    },
    hold: (id) => holds.set(id, (holds.get(id) ?? 0) + 1),
    release: (id) => holds.set(id, (holds.get(id) ?? 0) - 1),
    log: () => undefined,
  })
  return { runner, pending, events, stored, holds }
}

const answer = (over: Partial<SuggestionRequest> = {}): SuggestionRequest => ({
  meetingId: 7,
  trigger: 'ambient',
  purpose: 'answer',
  atMs: 12_000,
  apiKey: 'sk',
  model: 'claude-sonnet-5-5',
  system: 'sys',
  userContent: 'window',
  maxTokens: 500,
  effort: 'low',
  timeoutMs: 25_000,
  delivery: 'stream',
  ...over,
})

const coach = (over: Partial<SuggestionRequest> = {}): SuggestionRequest =>
  answer({ purpose: 'next-point', delivery: 'buffered', timeoutMs: 8_000, maxRetries: 0, ...over })

describe('suggestion runner', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('keeps one request per lane and lets the hotkey lane run beside ambient', () => {
    const { runner } = harness()
    expect(runner.start(answer())).not.toBeNull()
    expect(runner.start(answer())).toBeNull()
    expect(runner.canStart('hotkey')).toBe(true)
    expect(runner.start(answer({ trigger: 'hotkey', timeoutMs: 60_000 }))).not.toBeNull()
    expect(runner.inFlight()).toEqual({ ambient: true, hotkey: true })
  })

  it('streams an answer and persists the request snapshot it was given', async () => {
    const { runner, pending, events, stored, holds } = harness()
    const req = answer()
    const handle = runner.start(req)!
    req.atMs = 99_999 // a later change to the caller's object must not reach the stored row
    req.meetingId = 8
    pending[0].req.onDelta?.('Hi')
    pending[0].resolve('Hi there')
    await expect(handle.done).resolves.toBe('done')
    expect(events.map((e) => [e.kind, e.purpose])).toEqual([
      ['start', 'answer'],
      ['delta', 'answer'],
      ['done', 'answer'],
    ])
    expect(pending[0].req).toMatchObject({ model: 'claude-sonnet-5-5', userContent: 'window' })
    expect(stored[0]).toMatchObject({
      meetingId: 7,
      tMs: 12_000,
      trigger: 'ambient',
      purpose: 'answer',
    })
    expect(holds.get(7)).toBe(0)
    expect(runner.canStart('ambient')).toBe(true)
  })

  it('publishes a buffered next point only when complete and accepted', async () => {
    const { runner, pending, events, stored } = harness()
    const handle = runner.start(coach({ accept: (t) => t !== 'NONE' }))!
    expect(events).toEqual([])
    expect(pending[0].req.onDelta).toBeUndefined()
    expect(pending[0].req.maxRetries).toBe(0)
    pending[0].resolve('**Next point.**')
    await expect(handle.done).resolves.toBe('done')
    expect(events.map((e) => [e.kind, e.trigger, e.purpose])).toEqual([
      ['start', 'ambient', 'next-point'],
      ['done', 'ambient', 'next-point'],
    ])
    expect(stored[0].purpose).toBe('next-point')

    const noop = runner.start(coach({ accept: (t) => t !== 'NONE' }))!
    pending[1].resolve('NONE')
    await expect(noop.done).resolves.toBe('noop')
    expect(events).toHaveLength(2)
    expect(stored).toHaveLength(1)
  })

  it('frees the lane on cancel, and the stale owner cannot release the new one', async () => {
    const { runner, pending, events, stored, holds } = harness()
    const old = runner.start(coach())!
    old.cancel()
    expect(runner.canStart('ambient')).toBe(true)
    const fresh = runner.start(answer())!
    await expect(old.done).resolves.toBe('cancelled')
    expect(runner.canStart('ambient')).toBe(false) // still owned by the fresh answer
    expect(stored).toEqual([])
    expect(events.every((e) => e.purpose === 'answer')).toBe(true)
    pending[1].resolve('answer')
    await fresh.done
    expect(holds.get(7)).toBe(0)
  })

  it('never publishes a cancelled next point even if the provider still answers', async () => {
    const { runner, pending, events, stored } = harness()
    const run = runner.start(coach())!
    const late = pending[0]
    run.cancel()
    late.resolve('**Too late.**')
    await run.done
    expect(events).toEqual([])
    expect(stored).toEqual([])
  })

  it('balances the meeting hold on timeout, provider failure and persistence failure', async () => {
    const t = harness()
    const timedOut = t.runner.start(answer({ timeoutMs: 1_000 }))!
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(timedOut.done).resolves.toBe('timeout')
    expect(t.events.at(-1)).toMatchObject({
      kind: 'error',
      text: expect.stringContaining('1 seconds'),
    })

    const failed = t.runner.start(answer())!
    t.pending[1].reject(new Error('overloaded'))
    await expect(failed.done).resolves.toBe('error')
    expect(t.events.at(-1)).toMatchObject({ kind: 'error', text: 'overloaded' })

    const coachTimeout = t.runner.start(coach())!
    await vi.advanceTimersByTimeAsync(8_000)
    await expect(coachTimeout.done).resolves.toBe('timeout')
    expect(t.events.filter((e) => e.purpose === 'next-point')).toEqual([])
    expect(t.holds.get(7)).toBe(0)

    const disk = harness({ persistThrows: true })
    const run = disk.runner.start(coach())!
    disk.pending[0].resolve('**Point.**')
    await expect(run.done).resolves.toBe('error')
    expect(disk.events).toEqual([])
    expect(disk.holds.get(7)).toBe(0)
  })

  it('lets an answer that started before Stop finish: answers are not cancellable', async () => {
    const { runner, pending, stored } = harness()
    const run = runner.start(answer())!
    run.cancel() // no effect on a streamed answer
    pending[0].resolve('finished')
    await expect(run.done).resolves.toBe('done')
    expect(stored).toHaveLength(1)
  })

  it('reports a missing API key for answers without taking a lane', () => {
    const { runner, events, holds } = harness()
    expect(runner.start(answer({ apiKey: '', trigger: 'hotkey' }))).toBeNull()
    expect(events).toMatchObject([{ kind: 'error', trigger: 'hotkey' }])
    expect(runner.start(coach({ apiKey: '' }))).toBeNull()
    expect(events).toHaveLength(1) // a next point stays silent
    expect(runner.inFlight()).toEqual({ ambient: false, hotkey: false })
    expect(holds.size).toBe(0)
  })
})
