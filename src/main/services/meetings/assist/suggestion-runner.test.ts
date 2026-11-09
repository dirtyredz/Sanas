import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SuggestionEvent } from '@shared/types'
import type { AssistRequest } from '../../assistant/types'
import { observeLatency } from './latency'
import { observeRun } from '../observation/run-observation'
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
      return 123
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

  it('serializes effective policy, transport stages, attempts and stored ID; accepts late renderer receipt once', async () => {
    const records: string[] = []
    const evidence = observeLatency((r) => records.push(JSON.stringify(r)))
    try {
      const t = harness()
      const run = t.runner.start(
        answer({ profile: 'full', model: 'private-model-name', maxTokens: 1200, effort: 'medium' }),
      )!
      t.pending[0].req.onTiming?.({ kind: 'request-start', at: 100 })
      t.pending[0].req.onTiming?.({ kind: 'attempt', at: 100, attempt: 1 })
      t.pending[0].req.onTiming?.({ kind: 'attempt', at: 200, attempt: 2 })
      t.pending[0].req.onTiming?.({ kind: 'first-protocol', at: 300 })
      t.pending[0].req.onDelta?.('**Readable answer**')
      t.pending[0].resolve('**Readable answer**')
      await run.done
      const record = JSON.parse(records[0])
      expect(record).toMatchObject({
        storedSuggestionId: 123,
        effective: { profile: 'full', model: 'custom', maxTokens: 1200, effort: 'medium' },
        attempts: 2,
        retries: 1,
        providerRequestToFirstProtocolMs: 200,
      })
      expect(records.join('')).not.toContain('private-model-name')
      for (let i = 0; i < 2; i++)
        observeRun({
          kind: 'renderer',
          id: run.id,
          meetingId: 7,
          state: 'frame-after-commit',
          at: performance.now(),
        })
      expect(records).toHaveLength(2)
      expect(JSON.parse(records[1])).toMatchObject({
        kind: 'visibility',
        runId: run.id,
        visibility: 'frame-after-commit',
      })
      observeRun({
        kind: 'renderer',
        id: run.id,
        meetingId: 99,
        state: 'hidden',
        at: performance.now(),
      })
      expect(records).toHaveLength(2)
    } finally {
      evidence.stop()
    }
  })

  it('keeps one request per lane and lets the hotkey lane run beside ambient', () => {
    const { runner } = harness()
    expect(runner.start(answer())).not.toBeNull()
    expect(runner.start(answer())).toBeNull()
    expect(runner.canStart('hotkey')).toBe(true)
    expect(runner.start(answer({ trigger: 'hotkey', timeoutMs: 60_000 }))).not.toBeNull()
    expect(runner.inFlight()).toEqual({ ambient: true, hotkey: true })
  })

  it('forwards a screenshot to the provider but persists only the text prompt', async () => {
    const { runner, pending, stored, events } = harness()
    const image = { mediaType: 'image/png' as const, base64: 'cGl4ZWxz' }
    runner.start(answer({ trigger: 'hotkey', manualKind: 'capture', image }))
    expect(pending[0].req.image).toEqual(image)
    pending[0].resolve('**Fix**')
    await vi.runAllTimersAsync()
    expect(stored[0].promptWindow).toBe('window')
    expect(JSON.stringify(stored[0])).not.toContain('cGl4ZWxz')
    expect(JSON.stringify(events)).not.toContain('cGl4ZWxz')
    expect(events.at(-1)).toMatchObject({ kind: 'done', manualKind: 'capture' })
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
    expect(events.find((e) => e.kind === 'done')?.storedSuggestionId).toBe(123)
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

  it('treats an automatic answer of <none> as no suggestion: nothing shown or stored', async () => {
    const { runner, pending, events, stored, holds } = harness()
    const run = runner.start(answer({ allowNoop: true }))!
    expect(events).toEqual([]) // held back while it could still be the no-op
    pending[0].req.onDelta?.('<no')
    pending[0].req.onDelta?.('ne>')
    pending[0].resolve('<none>')
    await expect(run.done).resolves.toBe('noop')
    expect(events).toEqual([])
    expect(stored).toEqual([])
    expect(holds.get(7)).toBe(0)
    expect(runner.canStart('ambient')).toBe(true) // lane freed
  })

  it('streams a real automatic answer once it cannot be the no-op', async () => {
    const { runner, pending, events, stored } = harness()
    const run = runner.start(answer({ allowNoop: true }))!
    pending[0].req.onDelta?.('**')
    expect(events).toEqual([])
    pending[0].req.onDelta?.('Use')
    pending[0].req.onDelta?.(' a map.**')
    pending[0].resolve('**Use a map.**')
    await expect(run.done).resolves.toBe('done')
    expect(events.map((e) => [e.kind, e.text])).toEqual([
      ['start', ''],
      ['delta', '**Use'],
      ['delta', ' a map.**'],
      ['done', '**Use a map.**'],
    ])
    expect(stored).toHaveLength(1)

    // a short answer that never left the held prefix is still shown when it completes
    const short = runner.start(answer({ allowNoop: true }))!
    pending[1].req.onDelta?.('No')
    pending[1].resolve('No')
    await expect(short.done).resolves.toBe('done')
    expect(events.slice(4).map((e) => e.kind)).toEqual(['start', 'done'])
  })

  it('never declines a requested answer', async () => {
    const { runner, pending, events, stored } = harness()
    const run = runner.start(answer({ trigger: 'hotkey' }))!
    pending[0].resolve('<none>')
    await expect(run.done).resolves.toBe('done')
    expect(events.map((e) => e.kind)).toEqual(['start', 'done'])
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
    expect(events.find((e) => e.kind === 'done')?.storedSuggestionId).toBe(123)
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

describe('suggestion runner: speculative answers', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const auto = (over: Partial<SuggestionRequest> = {}): SuggestionRequest =>
    answer({ allowNoop: true, ...over })

  it('owns the ambient lane and holds the meeting, but shows nothing until promoted', async () => {
    const { runner, pending, events, stored, holds } = harness()
    const run = runner.speculate(auto())!
    expect(runner.canStart('ambient')).toBe(false)
    expect(runner.canStart('hotkey')).toBe(true)
    expect(holds.get(7)).toBe(1)
    pending[0].req.onDelta?.('**Use a key**')
    expect(events).toEqual([])
    expect(run.promote()).toBe(true)
    expect(events.map((e) => [e.kind, e.text])).toEqual([
      ['start', ''],
      ['delta', '**Use a key**'],
    ])
    pending[0].req.onDelta?.(' per request.')
    pending[0].resolve('**Use a key** per request.')
    await expect(run.done).resolves.toBe('done')
    expect(stored).toHaveLength(1)
    expect(holds.get(7)).toBe(0)
    run.cancel() // promoted: no longer withdrawable
    expect(events.at(-1)?.kind).toBe('done')
  })

  it('keeps a complete result unstored until promoted', async () => {
    const { runner, pending, events, stored } = harness()
    const run = runner.speculate(auto())!
    pending[0].resolve('**Two weeks.**')
    await vi.advanceTimersByTimeAsync(0)
    expect(stored).toEqual([])
    expect(run.promote()).toBe(true)
    await expect(run.done).resolves.toBe('done')
    expect(events.map((e) => e.kind)).toEqual(['start', 'done'])
    expect(stored).toHaveLength(1)
  })

  it.each([false, true])(
    'discards silently (provider finished first: %s), releasing everything once',
    async (finishFirst) => {
      const { runner, pending, events, stored, holds } = harness()
      const run = runner.speculate(auto())!
      pending[0].req.onDelta?.('**Text**')
      if (finishFirst) {
        pending[0].resolve('**Text**')
        await vi.advanceTimersByTimeAsync(0)
      }
      run.cancel()
      expect(runner.canStart('ambient')).toBe(true) // freed at once
      const next = runner.start(answer())!
      pending[0].req.onDelta?.(' late') // ignored
      await expect(run.done).resolves.toBe('discarded')
      expect(run.promote()).toBe(false)
      expect(runner.canStart('ambient')).toBe(false) // the stale run did not free the new owner
      expect(events.every((e) => e.suggestionId === next.id)).toBe(true)
      expect(stored).toEqual([])
      expect(holds.get(7)).toBe(1) // only the new run's hold remains
    },
  )

  it('ends silently on provider failure or timeout, and then refuses promotion', async () => {
    const t = harness()
    const failed = t.runner.speculate(auto())!
    t.pending[0].reject(new Error('overloaded'))
    await expect(failed.done).resolves.toBe('discarded')
    expect(failed.promote()).toBe(false)
    const held = t.runner.speculate(auto({ timeoutMs: 1_000 }))!
    t.pending[1].resolve('**Held.**')
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(held.done).resolves.toBe('discarded')
    expect(held.promote()).toBe(false)
    expect(t.events).toEqual([])
    expect(t.stored).toEqual([])
    expect(t.holds.get(7)).toBe(0)
    expect(t.runner.canStart('ambient')).toBe(true)
  })

  it('only speculates streamed ambient requests with a key on a free lane', () => {
    const { runner, events, holds } = harness()
    expect(runner.speculate(auto({ trigger: 'hotkey' }))).toBeNull()
    expect(runner.speculate(coach())).toBeNull()
    expect(runner.speculate(auto({ apiKey: '' }))).toBeNull()
    expect(events).toEqual([]) // no missing-key card for a speculation
    runner.start(answer())
    expect(runner.speculate(auto())).toBeNull()
    expect(holds.get(7)).toBe(1)
  })
})
