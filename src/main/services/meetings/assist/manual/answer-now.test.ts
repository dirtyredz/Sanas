import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ANSWER_NOW_QUESTION_MS } from '../../../turns/latest-question'
import { me, otherTurn, setup, them } from '../automatic/live-assistance-harness'

const diagnostics = vi.hoisted(() => vi.fn())
vi.mock('../../observation/diagnostics', () => ({ observeAssistance: diagnostics }))
beforeEach(() => diagnostics.mockClear())

describe('Answer now', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })
  afterEach(() => vi.useRealTimers())

  it('answers now regardless of classification, taking the hotkey lane', async () => {
    const t = setup()
    t.window.push({ speaker: 1, isUser: false, text: 'hello' })
    await otherTurn(t.assist, 'Can you explain it?', 0, 800)
    t.assist.answerNow()
    expect(t.generations).toHaveLength(1)
    expect(t.events[0]).toMatchObject({ trigger: 'hotkey', purpose: 'answer' })
  })

  it('Answer now carries the latest question, the told stories and a split window', async () => {
    const t = setup()
    t.window.push({ speaker: -1, isUser: true, text: 'Earlier federation story', tStartMs: 0 })
    t.window.push({
      speaker: 1,
      isUser: false,
      text: 'What services have you used?',
      tStartMs: 5_000,
    })
    t.window.push({ speaker: -1, isUser: true, text: 'Mostly S3 and', tStartMs: 7_000 })
    t.told.push({ headline: 'At Acme I ran the federation.', detail: 'Invoicing was mine.' })
    await otherTurn(t.assist, 'What services have you used?', 5_000, 6_500)
    t.assist.final(me('Mostly S3 and', 7_000, 7_800))
    await vi.advanceTimersByTimeAsync(30_000)
    t.assist.answerNow()
    const content = t.generations.at(-1)!.req.userContent
    expect(content).toContain(
      'The most recent question (Me asked for an answer to it now):\nS2: What services have you used?',
    )
    expect(content).not.toContain('cut off')
    expect(content).toContain('- At Acme I ran the federation. / Invoicing was mine.')
    expect(content).not.toContain('<none>')
    const current = content.slice(content.indexOf('Current exchange'))
    expect(current).toContain('S2: What services have you used?\nMe: Mostly S3 and')
    expect(current).not.toContain('federation story')
  })

  it('Answer now pressed mid-question anchors on the open turn and says it may be cut off', () => {
    const t = setup()
    t.window.push({
      speaker: 1,
      isUser: false,
      text: 'Talk to me about some of the Node',
      tStartMs: 0,
    })
    t.assist.final(them('Talk to me about some of the Node', 0, 1_500))
    t.assist.answerNow()
    const content = t.generations.at(-1)!.req.userContent
    expect(content).toContain('S2: Talk to me about some of the Node\nAnswer THAT question.')
    expect(content).toContain('It may still be cut off')
  })

  it('Answer now without a recent question answers from the rolling window as before', async () => {
    const t = setup()
    t.window.push({ speaker: 1, isUser: false, text: 'Can you explain it?' })
    await otherTurn(t.assist, 'Can you explain it?', 0, 800)
    await vi.advanceTimersByTimeAsync(ANSWER_NOW_QUESTION_MS + 1_000)
    t.assist.answerNow()
    const content = t.generations.at(-1)!.req.userContent
    expect(content.startsWith('Rolling transcript (most recent last):')).toBe(true)
    expect(content).not.toContain('The most recent question')
  })
})
