import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  calls: [] as { body: Record<string, unknown>; options: Record<string, unknown> }[],
  clients: [] as Record<string, unknown>[],
  failWith: null as Error | null,
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    static APIConnectionError = class APIConnectionError extends Error {}
    static APIConnectionTimeoutError = class APIConnectionTimeoutError
      extends this.APIConnectionError {}
    messages = {
      stream: (body: Record<string, unknown>, options: Record<string, unknown>) => {
        sdk.calls.push({ body, options })
        return {
          on: (kind: string, callback: () => void) => {
            if (kind === 'streamEvent') {
              callback()
              callback()
            }
          },
          finalMessage: async () => {
            if (sdk.failWith) throw sdk.failWith
            return {
              stop_reason: 'end_turn',
              content: [{ type: 'text', text: 'question' }],
            }
          },
        }
      },
    }
    constructor(opts: Record<string, unknown>) {
      sdk.clients.push(opts)
    }
  },
}))

import { claudeProvider, requestOptions } from './claude'
import { providerFailureCategory } from './provider-error'
import Anthropic from '@anthropic-ai/sdk'

const base = {
  apiKey: 'sk-test',
  model: 'claude-haiku-5-5',
  system: 'sys',
  userContent: 'turn',
  maxTokens: 64,
  effort: 'low' as const,
}

describe('Claude provider request options', () => {
  beforeEach(() => {
    sdk.calls = []
    sdk.clients = []
    sdk.failWith = null
  })

  it('forwards a per-request retry limit and deadline', async () => {
    const controller = new AbortController()
    await expect(
      claudeProvider.complete({
        ...base,
        maxRetries: 0,
        timeoutMs: 2_500,
        signal: controller.signal,
      }),
    ).resolves.toBe('question')
    expect(sdk.calls[0].options).toEqual({
      signal: controller.signal,
      timeout: 2_500,
      maxRetries: 0,
    })
    expect(sdk.calls[0].body).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 64 })
    // Haiku keeps the portable request shape: no effort parameter
    expect(sdk.calls[0].body).not.toHaveProperty('output_config')
  })

  it('reports one protocol event and every transport attempt, without exposing payloads or throwing', async () => {
    const timing = vi.fn()
    await claudeProvider.complete({ ...base, onTiming: timing })
    expect(timing.mock.calls.map(([e]) => e.kind)).toEqual([
      'request-start',
      'policy',
      'first-protocol',
    ])
    expect(timing.mock.calls[1][0]).toMatchObject({ effort: 'omitted', thinking: 'disabled' })
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(''))
    try {
      const transport = sdk.clients[0].fetch as typeof globalThis.fetch
      await transport('https://example.invalid')
      await transport('https://example.invalid')
      expect(timing.mock.calls.slice(-2).map(([e]) => e.attempt)).toEqual([1, 2])
      await expect(
        claudeProvider.complete({
          ...base,
          onTiming: () => {
            throw new Error('observer')
          },
        }),
      ).resolves.toBe('question')
    } finally {
      fetch.mockRestore()
    }
  })

  it.each([
    ['classifier', 64],
    ['points', 220],
    ['smart', 500],
  ])(
    'turns thinking off for the short %s budget so it cannot spend it all on reasoning',
    async (_n, maxTokens) => {
      await claudeProvider.complete({ ...base, maxTokens })
      expect(sdk.calls[0].body).toMatchObject({ thinking: { type: 'disabled' } })
    },
  )

  it('sends between_tools plus effort for Sonnet at a short budget', async () => {
    await claudeProvider.complete({ ...base, model: 'claude-sonnet-5-5', maxTokens: 220 })
    expect(sdk.calls[0].body).toMatchObject({
      thinking: { type: 'between_tools' },
      output_config: { effort: 'low' },
    })
  })

  it.each(['claude-opus-5-5', 'my-custom-model'])(
    'sends no thinking parameter for %s at a short budget (the API would 400)',
    async (model) => {
      await claudeProvider.complete({ ...base, model, maxTokens: 220 })
      expect(sdk.calls[0].body).not.toHaveProperty('thinking')
    },
  )

  it.each(['claude-haiku-5-5', 'claude-sonnet-5-5'])(
    'keeps default thinking for full answers on %s',
    async (model) => {
      await claudeProvider.complete({ ...base, model, maxTokens: 1200 })
      expect(sdk.calls[0].body).not.toHaveProperty('thinking')
    },
  )

  it('leaves the SDK retry default alone for existing callers', async () => {
    await claudeProvider.complete({ ...base, model: 'claude-sonnet-5-5', timeoutMs: 25_000 })
    expect(sdk.calls[0].options).not.toHaveProperty('maxRetries')
    expect(sdk.calls[0].options.timeout).toBe(25_000)
    expect(sdk.calls[0].body).toMatchObject({ output_config: { effort: 'low' } })
  })

  it('omits timeout entirely when the caller set none (summaries, Ask)', async () => {
    // the SDK rejects an explicit `timeout: undefined` as "timeout must be an integer"
    await claudeProvider.complete(base)
    expect(sdk.calls[0].options).toEqual({})
    expect('timeout' in sdk.calls[0].options).toBe(false)
    expect('signal' in sdk.calls[0].options).toBe(false)
  })

  it('sends only valid positive integer timeouts', () => {
    expect(requestOptions({ ...base, timeoutMs: 2_500.4 })).toEqual({ timeout: 2_500 })
    expect(requestOptions({ ...base, timeoutMs: 0 })).toEqual({})
    expect(requestOptions({ ...base, timeoutMs: -5 })).toEqual({})
    expect(requestOptions({ ...base, timeoutMs: Number.NaN })).toEqual({})
    expect(requestOptions({ ...base, maxRetries: 1.5 })).toEqual({})
  })

  it('adds the workspace header only when set', async () => {
    await claudeProvider.complete({ ...base, workspaceId: 'ws_1' })
    await claudeProvider.complete(base)
    expect(sdk.clients[0].defaultHeaders).toEqual({ 'anthropic-workspace-id': 'ws_1' })
    expect(sdk.clients[1].defaultHeaders).toBeUndefined()
  })
})

it('owns separate cache breakpoints for stable job and optional effective deck', async () => {
  sdk.calls = []
  await claudeProvider.complete({ ...base, cacheableContext: 'deck' })
  await claudeProvider.complete(base)
  expect(sdk.calls[0].body.system).toEqual([
    { type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } },
    { type: 'text', text: 'deck', cache_control: { type: 'ephemeral' } },
  ])
  expect(sdk.calls[1].body.system).toEqual([
    { type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } },
  ])
})

describe('image input', () => {
  const image = { mediaType: 'image/png' as const, base64: 'aGVsbG8=' }

  it('sends the image before the text and never retries it', async () => {
    sdk.calls = []
    await claudeProvider.complete({ ...base, image, maxRetries: 3, cacheableContext: 'deck' })
    expect(sdk.calls[0].body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' } },
          { type: 'text', text: 'turn' },
        ],
      },
    ])
    expect(sdk.calls[0].options.maxRetries).toBe(0)
    // the image never enters the cached system blocks
    expect(JSON.stringify(sdk.calls[0].body.system)).not.toContain('aGVsbG8=')
  })

  it('keeps text-only requests in their existing shape', async () => {
    sdk.calls = []
    await claudeProvider.complete(base)
    expect(sdk.calls[0].body.messages).toEqual([{ role: 'user', content: 'turn' }])
  })

  it('the reported policy event always equals what the request body put on the wire', async () => {
    const cases = [
      { model: 'claude-haiku-5-5', maxTokens: 64 },
      { model: 'claude-sonnet-5-5', maxTokens: 64 },
      { model: 'claude-opus-5-5', maxTokens: 1200 },
      { model: 'custom-model', maxTokens: 64 },
    ]
    for (const c of cases) {
      sdk.calls = []
      const timing = vi.fn()
      await claudeProvider.complete({ ...base, ...c, effort: 'medium', onTiming: timing })
      const policy = timing.mock.calls.map(([e]) => e).find((e) => e.kind === 'policy')
      const body = sdk.calls[0].body as {
        output_config?: { effort: string }
        thinking?: { type: string }
      }
      expect(policy.effort).toBe(body.output_config?.effort ?? 'omitted')
      expect(policy.thinking).toBe(body.thinking?.type ?? 'default')
    }
  })

  it('tags SDK transport errors with a neutral category at the seam, timeout before connection', async () => {
    const failures: [Error, string | undefined][] = [
      [new Anthropic.APIConnectionTimeoutError(), 'timeout'],
      [new Anthropic.APIConnectionError({}), 'connection'],
      [new Error('other'), undefined],
    ]
    for (const [error, category] of failures) {
      sdk.failWith = error
      const caught = await claudeProvider.complete(base).catch((e) => e)
      expect(caught).toBe(error) // same object: message, status and request id intact
      expect(providerFailureCategory(caught)).toBe(category)
    }
  })
})
