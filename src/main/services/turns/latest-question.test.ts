import { describe, expect, it } from 'vitest'
import { ANSWER_NOW_QUESTION_MS, couldBeQuestion, latestQuestion } from './latest-question'
import { TurnAssembler } from './turn-assembler'
import type { CompletedTurn } from './types'

const done = (
  text: string,
  startMs: number,
  endMs: number,
  completedAt: number,
): CompletedTurn => ({
  id: 1,
  channel: 1,
  speaker: 0,
  role: 'other',
  text,
  startMs,
  endMs,
  words: text.split(/\s+/).length,
  fragments: 1,
  completedAt,
  reason: 'endpoint',
})

describe('latest question for Answer now', () => {
  it('uses the last completed other-speaker question while it is recent', () => {
    const q = done('Other than Lambda, what services have you used?', 1_000, 3_000, 10_000)
    expect(latestQuestion(q, [], 20_000, ANSWER_NOW_QUESTION_MS)).toEqual({
      id: 1,
      channel: 1,
      speaker: 0,
      text: q.text,
      startMs: 1_000,
      open: false,
    })
    expect(latestQuestion(q, [], 10_000 + ANSWER_NOW_QUESTION_MS + 1, ANSWER_NOW_QUESTION_MS)).toBe(
      null,
    )
    expect(latestQuestion(null, [], 0, ANSWER_NOW_QUESTION_MS)).toBe(null)
  })

  it('prefers a question still being spoken, marked open, over an older completed one', () => {
    const asm = new TurnAssembler()
    asm.final(
      {
        channel: 1,
        speaker: 0,
        role: 'other',
        tStartMs: 5_000,
        tEndMs: 6_000,
        text: 'Talk to me about some of the Node',
      },
      0,
    )
    asm.final(
      { channel: 0, speaker: -1, role: 'user', tStartMs: 5_100, tEndMs: 5_300, text: 'mm' },
      0,
    )
    const older = done('What is your level of experience with AWS?', 1_000, 3_000, 0)
    expect(latestQuestion(older, asm.openTurns(), 1, ANSWER_NOW_QUESTION_MS)).toEqual({
      id: 1,
      channel: 1,
      speaker: 0,
      text: 'Talk to me about some of the Node',
      startMs: 5_000,
      open: true,
    })
  })

  it('ignores backchannel and Me', () => {
    expect(couldBeQuestion({ role: 'other', text: 'mm-hm right' })).toBe(false)
    expect(couldBeQuestion({ role: 'user', text: 'What services have you used?' })).toBe(false)
    expect(couldBeQuestion({ role: 'unknown', text: 'What services have you used?' })).toBe(true)
  })
})
