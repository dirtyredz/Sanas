import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  calls: [] as { body: Record<string, unknown>; options: Record<string, unknown> }[],
  clients: [] as Record<string, unknown>[],
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      stream: (body: Record<string, unknown>, options: Record<string, unknown>) => {
        sdk.calls.push({ body, options })
        return {
          on: () => undefined,
          finalMessage: async () => ({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'question' }],
          }),
        }
      },
    }
    constructor(opts: Record<string, unknown>) {
      sdk.clients.push(opts)
    }
  },
}))

import { claudeProvider, requestOptions } from './claude'

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
})
