import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CLASSIFIER_DEADLINE_MS,
  CLASSIFIER_SYSTEM,
  buildClassifierInput,
  classifyTurn,
  parseClassification,
  type ClassifyRequest,
} from './classifier'
import type { AssistantProvider, AssistRequest } from './types'

function provider(impl: (req: AssistRequest) => Promise<string>): {
  p: AssistantProvider
  calls: AssistRequest[]
} {
  const calls: AssistRequest[] = []
  return {
    calls,
    p: {
      complete: (req) => {
        calls.push(req)
        return impl(req)
      },
    },
  }
}

const request = (over: Partial<ClassifyRequest> = {}): ClassifyRequest => ({
  apiKey: 'sk',
  workspaceId: 'ws',
  model: 'claude-haiku-5-5',
  current: { speaker: 'S2', text: 'How do you make a linked list?' },
  previous: [],
  ...over,
})

describe('turn classifier', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sends one bounded, non-streaming, zero-retry request with the chosen model', async () => {
    const { p, calls } = provider(async () => 'question me')
    await expect(classifyTurn(p, request())).resolves.toEqual({
      status: 'classified',
      kind: 'question',
      addressee: 'me',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      apiKey: 'sk',
      workspaceId: 'ws',
      model: 'claude-haiku-5-5',
      system: CLASSIFIER_SYSTEM,
      maxTokens: 64,
      effort: 'low',
      maxRetries: 0,
      timeoutMs: CLASSIFIER_DEADLINE_MS,
    })
    expect(calls[0].onDelta).toBeUndefined()
    expect(calls[0].userContent).toContain('S2: How do you make a linked list?')
  })

  it.each([
    ['question me', { kind: 'question', addressee: 'me' }],
    ['request room', { kind: 'request', addressee: 'room' }],
    ['objection other', { kind: 'objection', addressee: 'other' }],
    ['none', { kind: 'none' }],
  ])('accepts %s', async (token, verdict) => {
    const { p } = provider(async () => ` ${token}\n`)
    await expect(classifyTurn(p, request())).resolves.toEqual({
      status: 'classified',
      ...verdict,
    })
  })

  it.each([
    '',
    'question',
    'Question me',
    'question  me',
    'question everyone',
    'none room',
    'question me.',
    'question me because they asked',
    'yes',
  ])('fails closed on malformed output %j', async (text) => {
    const { p } = provider(async () => text)
    await expect(classifyTurn(p, request())).resolves.toEqual({
      status: 'failed',
      reason: 'malformed',
    })
  })

  it('fails closed when the provider rejects, without retrying', async () => {
    const { p, calls } = provider(async () => {
      throw new Error('overloaded')
    })
    await expect(classifyTurn(p, request())).resolves.toEqual({
      status: 'failed',
      reason: 'provider',
    })
    expect(calls).toHaveLength(1)
  })

  it('times out at the deadline, aborts, and discards a late result', async () => {
    let resolveLate: (t: string) => void = () => undefined
    const { p, calls } = provider(
      () =>
        new Promise<string>((resolve) => {
          resolveLate = resolve
        }),
    )
    const outcome = classifyTurn(p, request())
    await vi.advanceTimersByTimeAsync(CLASSIFIER_DEADLINE_MS)
    await expect(outcome).resolves.toEqual({ status: 'failed', reason: 'timeout' })
    expect(calls[0].signal?.aborted).toBe(true)
    resolveLate('question me') // too late: the outcome is already settled
    await expect(outcome).resolves.toEqual({ status: 'failed', reason: 'timeout' })
  })

  it('reports cancellation from the caller', async () => {
    const { p, calls } = provider(() => new Promise<string>(() => undefined))
    const controller = new AbortController()
    const outcome = classifyTurn(p, request({ signal: controller.signal }))
    controller.abort()
    await expect(outcome).resolves.toEqual({ status: 'failed', reason: 'cancelled' })
    expect(calls[0].signal?.aborted).toBe(true)

    const already = new AbortController()
    already.abort()
    await expect(classifyTurn(p, request({ signal: already.signal }))).resolves.toEqual({
      status: 'failed',
      reason: 'cancelled',
    })
    expect(calls).toHaveLength(1) // an already-cancelled request never calls the provider
  })
})

describe('classifier input', () => {
  it('caps the current turn, keeping its opening and ending', () => {
    const text = `Opening ${'x'.repeat(10_000)} ending?`
    const input = buildClassifierInput({ speaker: 'S1', text }, [])
    expect(input).toContain('S1: Opening')
    expect(input).toContain('ending?')
    expect(input.length).toBeLessThan(4_300)
  })

  it('keeps at most two previous turns within 1,500 characters, most recent first kept', () => {
    const input = buildClassifierInput({ speaker: 'S1', text: 'Thoughts?' }, [
      { speaker: 'S1', text: 'oldest turn' },
      { speaker: 'Me', text: 'a'.repeat(1_000) },
      { speaker: 'S2', text: `recent ${'b'.repeat(1_000)}` },
    ])
    expect(input).not.toContain('oldest turn')
    expect(input).toContain('S2: recent')
    const context = input.slice(input.indexOf('<<<') + 4, input.indexOf('>>>'))
    expect(context.length).toBeLessThanOrEqual(1_501)
  })

  it('parses strictly', () => {
    expect(parseClassification('none')).toEqual({ kind: 'none' })
    expect(parseClassification('NONE')).toBeNull()
  })
})
