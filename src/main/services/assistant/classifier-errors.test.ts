import { afterEach, expect, it, vi } from 'vitest'
import { classifyTurn } from './classifier'
import { TokenBudgetError } from './completion-result'
const req = {
  apiKey: 'SECRET_KEY',
  model: 'test-model',
  current: { speaker: 'S1', text: 'PRIVATE_PROMPT' },
  previous: [],
}
afterEach(() => vi.useRealTimers())
it.each([
  [401, 'authentication'],
  [429, 'rate-limit'],
] as const)('retains sanitized %s diagnostics', async (status, category) => {
  const result = await classifyTurn(
    {
      complete: async () => {
        throw {
          status,
          request_id: 'req_123',
          message: 'SECRET_KEY PRIVATE_BODY',
          body: 'PRIVATE_BODY',
        }
      },
    },
    req,
  )
  expect(result).toMatchObject({
    status: 'failed',
    reason: 'provider',
    diagnostic: {
      category,
      httpStatus: status,
      requestId: 'req_123',
      model: 'test-model',
      elapsedMs: expect.any(Number),
    },
  })
  expect(JSON.stringify(result)).not.toMatch(/SECRET|PRIVATE/)
})
it('distinguishes deadline and malformed verdict without retaining output', async () => {
  vi.useFakeTimers()
  const pending = classifyTurn({ complete: () => new Promise(() => {}) }, req, 10)
  await vi.advanceTimersByTimeAsync(10)
  expect(await pending).toMatchObject({ reason: 'timeout', diagnostic: { category: 'timeout' } })
  const malformed = await classifyTurn({ complete: async () => 'PRIVATE_BODY' }, req)
  expect(malformed).toMatchObject({ reason: 'malformed', diagnostic: { category: 'malformed' } })
  expect(JSON.stringify(malformed)).not.toContain('PRIVATE')
})
it('keeps a sanitized error class name and a connection category, never the message', async () => {
  const named = (name: string, message: string): Error =>
    Object.assign(new Error(message), { name })
  const connection = await classifyTurn(
    {
      complete: async () => {
        throw named('APIConnectionError', 'SECRET_KEY PRIVATE_BODY')
      },
    },
    req,
  )
  expect(connection).toMatchObject({
    diagnostic: { category: 'connection', errorName: 'APIConnectionError' },
  })
  const budget = await classifyTurn(
    {
      complete: async () => {
        throw new TokenBudgetError()
      },
    },
    req,
  )
  expect(budget).toMatchObject({
    reason: 'provider',
    diagnostic: { category: 'provider', errorName: 'TokenBudgetError' },
  })
  const hostile = await classifyTurn(
    {
      complete: async () => {
        throw named('SECRET_KEY has spaces', 'PRIVATE_BODY')
      },
    },
    req,
  )
  expect(hostile.status === 'failed' && hostile.diagnostic).not.toHaveProperty('errorName')
  expect(JSON.stringify([connection, budget, hostile])).not.toMatch(/SECRET|PRIVATE/)
})
it('rejects arbitrary request-id text and error bodies', async () => {
  const result = await classifyTurn(
    {
      complete: async () => {
        throw { status: 401, request_id: 'SECRET_KEY PRIVATE_BODY', message: 'PRIVATE_BODY' }
      },
    },
    req,
  )
  expect(JSON.stringify(result)).not.toMatch(/SECRET|PRIVATE/)
})
