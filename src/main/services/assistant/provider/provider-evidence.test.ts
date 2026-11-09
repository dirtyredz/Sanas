import { beforeEach, describe, expect, it, vi } from 'vitest'
import { redactLogText } from '../../../lifecycle/main-log'

const sdk = vi.hoisted(() => ({
  final: null as null | (() => Promise<unknown>),
  current: undefined as unknown,
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      stream: () => ({
        on: () => undefined,
        finalMessage: () => sdk.final!(),
        get currentMessage() {
          return sdk.current
        },
      }),
    }
  },
}))

import { claudeProvider } from './claude'
import { usageFromAnthropic } from './claude-usage'
import { reportUsage } from './provider-evidence'
import type { ProviderUsage } from '../types'

const base = {
  apiKey: 'sk-test',
  model: 'claude-haiku-5-5',
  system: 'sys',
  userContent: 'turn',
  maxTokens: 64,
  effort: 'low' as const,
}

const sdkUsage = {
  input_tokens: 120,
  output_tokens: 30,
  cache_read_input_tokens: 4000,
  cache_creation_input_tokens: 0,
}

describe('provider usage extraction', () => {
  it('keeps the four counts as separate fields, never summed', () => {
    expect(usageFromAnthropic(sdkUsage, false)).toEqual({
      inputCount: 120,
      outputCount: 30,
      cacheReadCount: 4000,
      cacheWriteCount: 0,
      partial: false,
    })
  })

  it('treats missing or invalid fields as unknown, not zero', () => {
    expect(usageFromAnthropic({ input_tokens: 5, cache_read_input_tokens: null }, true)).toEqual({
      inputCount: 5,
      partial: true,
    })
    expect(usageFromAnthropic({ output_tokens: -1 }, false)).toBeNull()
    expect(usageFromAnthropic(undefined, false)).toBeNull()
  })

  it('swallows an observer failure', () => {
    expect(() =>
      reportUsage(
        () => {
          throw new Error('boom')
        },
        usageFromAnthropic(sdkUsage, false),
      ),
    ).not.toThrow()
  })

  it('survives the main log: count fields are not redacted like token fields', () => {
    const usage = usageFromAnthropic(sdkUsage, false)
    const line = redactLogText(`[sanas] latency ${JSON.stringify({ usage })}`)
    expect(line).toContain('"inputCount":120')
    expect(line).toContain('"cacheReadCount":4000')
    // secret redaction is unchanged
    expect(redactLogText('token=abc123')).toBe('token=[REDACTED]')
  })
})

describe('Claude provider usage reporting', () => {
  beforeEach(() => {
    sdk.current = undefined
  })

  it('reports final usage once, after a completed call', async () => {
    sdk.final = async () => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'question me' }],
      usage: sdkUsage,
    })
    const seen: ProviderUsage[] = []
    await expect(claudeProvider.complete({ ...base, onUsage: (u) => seen.push(u) })).resolves.toBe(
      'question me',
    )
    expect(seen).toEqual([expect.objectContaining({ inputCount: 120, partial: false })])
  })

  it('reports partial usage from the stream snapshot when the call fails or is cancelled', async () => {
    sdk.current = { usage: { input_tokens: 120, output_tokens: 7 } }
    sdk.final = async () => {
      throw new Error('aborted')
    }
    const seen: ProviderUsage[] = []
    await expect(
      claudeProvider.complete({ ...base, onUsage: (u) => seen.push(u) }),
    ).rejects.toThrow('aborted')
    expect(seen).toEqual([{ inputCount: 120, outputCount: 7, partial: true }])
  })

  it('a throwing usage observer cannot fail generation', async () => {
    sdk.final = async () => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'ok' }],
      usage: sdkUsage,
    })
    await expect(
      claudeProvider.complete({
        ...base,
        onUsage: () => {
          throw new Error('observer broke')
        },
      }),
    ).resolves.toBe('ok')
  })
})
