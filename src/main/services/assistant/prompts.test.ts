import { describe, expect, it } from 'vitest'
import { assistProfile, buildUserContent, type TranscriptLine } from './prompts'

const window: TranscriptLine[] = [
  { speaker: 1, isUser: false, text: 'Can you make me a linked list in JavaScript?' },
]

describe('whisper prompt modes', () => {
  it('makes hotkey requests full in every mode', () => {
    for (const mode of ['smart', 'full', 'points'] as const) {
      const prompt = buildUserContent(window, 'hotkey', mode)
      expect(assistProfile('hotkey', mode)).toMatchObject({
        kind: 'full',
        maxTokens: 1200,
        useAnswerModel: true,
      })
      expect(prompt).toContain('Give the actual answer')
      expect(prompt).toContain('25 lines')
    }
  })

  it('asks smart mode to answer concrete asks and coach everything else', () => {
    const prompt = buildUserContent(window, 'ambient', 'smart')
    expect(prompt).toContain('concrete ask for code')
    expect(prompt).toContain('give the actual answer')
    expect(prompt).toContain('Otherwise give one short, speakable line')
    expect(assistProfile('ambient', 'smart')).toMatchObject({
      maxTokens: 500,
      useAnswerModel: false,
    })
  })

  it('keeps points ambient output tight and makes full ambient output a full answer', () => {
    expect(buildUserContent(window, 'ambient', 'points')).toContain(
      'do not expand into a full answer',
    )
    expect(assistProfile('ambient', 'points')).toMatchObject({ kind: 'points', maxTokens: 220 })
    expect(buildUserContent(window, 'ambient', 'full')).toContain('Give the actual answer')
    expect(assistProfile('ambient', 'full')).toMatchObject({
      kind: 'full',
      maxTokens: 1200,
      useAnswerModel: true,
    })
  })

  it('answers the explicit triggering turn, not just the latest line', () => {
    const lines: TranscriptLine[] = [
      ...window,
      { speaker: -1, isUser: true, text: 'Sure, one second.' },
    ]
    const prompt = buildUserContent(lines, 'ambient', 'smart', undefined, {
      speaker: 'S2',
      text: 'Can you make me a linked list in JavaScript?',
      kind: 'request',
    })
    expect(prompt).toContain(
      'Respond to this completed turn (a request):\nS2: Can you make me a linked list in JavaScript?',
    )
    expect(prompt.indexOf('Respond to this completed turn')).toBeLessThan(
      prompt.indexOf('concrete ask for code'),
    )
    expect(buildUserContent(lines, 'hotkey', 'smart')).not.toContain('Respond to this completed')
  })

  it('always includes the compact output contract', () => {
    const prompt = buildUserContent(window, 'ambient', 'smart')
    expect(prompt).toContain('Line 1 is one bold headline')
    expect(prompt).toContain('Optionally include ONE fenced code block')
    expect(prompt).toContain('at most 2 short follow-up lines')
    expect(prompt).toContain('No headings, bullet walls, preamble')
  })
})
