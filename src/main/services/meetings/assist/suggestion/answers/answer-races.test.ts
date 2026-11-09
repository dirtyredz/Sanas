import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { setup, otherTurn, deferred, them } from '../../automatic/live-assistance-harness'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('reuses an automatic answer instead of persisting a second Answer-now card', async () => {
  const t = setup()
  t.window.push({ speaker: 1, isUser: false, text: 'Are you authorized to work here?' })
  await otherTurn(t.assist, 'Are you authorized to work here?', 0, 1000)
  await t.classify(0, t.question)
  t.generations[0].d.resolve('**Yes, I am authorized.**')
  await vi.advanceTimersByTimeAsync(0)
  t.assist.answerNow()
  expect(t.generations).toHaveLength(1)
  expect(t.stored).toHaveLength(1)
  t.assist.halt()
})

it('Answer now supersedes unpublished speculation before delayed classification', async () => {
  const t = setup({}, { speculate: true })
  t.window.push({ speaker: 1, isUser: false, text: 'What did you build with Node?' })
  await otherTurn(t.assist, 'What did you build with Node?', 0, 1000)
  t.assist.answerNow()
  await t.classify(0, t.question)
  t.generations.at(-1)!.d.resolve('**I built a service.**')
  await vi.advanceTimersByTimeAsync(0)
  expect(t.events.filter((e) => e.kind === 'start')).toHaveLength(1)
  expect(t.stored).toHaveLength(1)
  t.assist.halt()
})

it.each([true, false])(
  'reserves before retrieval in either classifier race order (%s)',
  async (classifyFirst) => {
    const lookups: ReturnType<typeof deferred<string>>[] = []
    const t = setup(
      {},
      {
        speculate: true,
        retrieve: () => {
          const d = deferred<string>()
          lookups.push(d)
          return { ready: d.promise, cancel: () => {} }
        },
      },
    )
    t.window.push({ speaker: 1, isUser: false, text: 'What services did you build?' })
    await otherTurn(t.assist, 'What services did you build?', 0, 1000)
    if (classifyFirst) await t.classify(0, t.question)
    t.assist.answerNow()
    t.assist.answerNow()
    expect(lookups).toHaveLength(2)
    lookups[0].resolve('automatic evidence')
    await vi.advanceTimersByTimeAsync(0)
    if (!classifyFirst) await t.classify(0, t.question)
    expect(t.generations).toHaveLength(0)
    lookups[1].resolve('manual evidence')
    await vi.advanceTimersByTimeAsync(0)
    expect(t.generations).toHaveLength(1)
    expect(t.generations[0].req.maxTokens).toBe(1200)
    t.generations[0].d.resolve('A full answer')
    await vi.advanceTimersByTimeAsync(0)
    expect(t.stored).toHaveLength(1)
    t.assist.halt()
  },
)

it('reuses while streaming, retries a failed answer, and admits expanded partial evidence', async () => {
  const t = setup()
  t.window.push({ speaker: 1, isUser: false, text: 'Talk to me about some of the Node' })
  t.assist.final(them('Talk to me about some of the Node', 0, 500))
  t.assist.answerNow()
  t.generations[0].req.onDelta?.('An answer')
  t.assist.answerNow()
  expect(t.generations).toHaveLength(1)
  t.generations[0].d.reject(new Error('offline'))
  await vi.advanceTimersByTimeAsync(0)
  t.assist.answerNow()
  expect(t.generations).toHaveLength(2)
  t.generations[1].d.resolve('First revision')
  await vi.advanceTimersByTimeAsync(0)
  t.assist.final(them('services you built for streaming ingestion.', 600, 1000))
  t.assist.answerNow()
  expect(t.generations).toHaveLength(3)
  t.generations[2].d.resolve('Expanded revision')
  await vi.advanceTimersByTimeAsync(0)
  t.assist.halt()
})

it('a repeated question in a later occurrence is independent', async () => {
  const t = setup({ nudgeCooldownSec: 0 })
  t.window.push({ speaker: 1, isUser: false, text: 'What services did you build?' })
  await otherTurn(t.assist, 'What services did you build?', 0, 1000)
  await t.classify(0, t.question)
  t.generations[0].d.resolve('First answer')
  await vi.advanceTimersByTimeAsync(1100)
  await otherTurn(t.assist, 'What services did you build?', 2000, 3000)
  await t.classify(1, t.question)
  expect(t.generations).toHaveLength(2)
  t.generations[1].d.resolve('Second answer')
  await vi.advanceTimersByTimeAsync(0)
  t.assist.halt()
})

it('stack subset reuse leaves unrelated unanswered questions available', async () => {
  const t = setup({ nudgeCooldownSec: 0 })
  t.window.push({ speaker: 1, isUser: false, text: 'What services did you build?' })
  await otherTurn(t.assist, 'What services did you build?', 0, 500)
  await vi.advanceTimersByTimeAsync(1100)
  await otherTurn(t.assist, 'How did you deploy them?', 1000, 1500, 2)
  t.assist.answerNow()
  t.generations[0].d.resolve('Deployment answer')
  await vi.advanceTimersByTimeAsync(0)
  await t.classify(0, t.question)
  await vi.advanceTimersByTimeAsync(1100)
  await otherTurn(t.assist, 'How did you monitor them?', 2000, 2500, 3)
  await t.classify(1, t.question)
  expect(t.generations[1].req.userContent).toContain('What services did you build?')
  expect(t.generations[1].req.userContent).not.toContain('How did you deploy them?')
  t.generations[1].d.resolve('Remaining answers')
  await vi.advanceTimersByTimeAsync(0)
  t.assist.halt()
})

it('supersedes an ordinary automatic run before its first visible text', async () => {
  const t = setup()
  t.window.push({ speaker: 1, isUser: false, text: 'How did you deploy it?' })
  await otherTurn(t.assist, 'How did you deploy it?', 0, 1000)
  await t.classify(0, t.question)
  expect(t.events).toHaveLength(0)
  t.assist.answerNow()
  expect(t.generations[0].req.signal?.aborted).toBe(true)
  t.generations[0].req.onDelta?.('Late automatic text')
  t.generations[1].d.resolve('Requested answer')
  await vi.advanceTimersByTimeAsync(0)
  expect(t.events.filter((e) => e.kind === 'start')).toHaveLength(1)
  expect(t.stored).toHaveLength(1)
  t.assist.halt()
})

it.each(['noop', 'empty', 'timeout'] as const)(
  'releases %s automatic coverage for explicit retry',
  async (outcome) => {
    const t = setup()
    t.window.push({ speaker: 1, isUser: false, text: 'How did you deploy it?' })
    await otherTurn(t.assist, 'How did you deploy it?', 0, 1000)
    await t.classify(0, t.question)
    if (outcome === 'timeout') await vi.advanceTimersByTimeAsync(25001)
    else {
      t.generations[0].d.resolve(outcome === 'noop' ? '<none>' : '')
      await vi.advanceTimersByTimeAsync(0)
    }
    expect(t.stored).toHaveLength(0)
    t.assist.answerNow()
    expect(t.generations).toHaveLength(2)
    t.generations[1].d.resolve('Retried answer')
    await vi.advanceTimersByTimeAsync(0)
    expect(t.stored).toHaveLength(1)
    t.assist.halt()
  },
)
