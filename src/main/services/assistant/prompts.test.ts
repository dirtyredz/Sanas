import { describe, expect, it } from 'vitest'
import {
  assistProfile,
  buildSummaryPrompt,
  buildSystemPrompt,
  buildUserContent,
  SUMMARY_CHARS,
  summaryMaxTokens,
  type TranscriptLine,
} from './prompts'

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
    const prompt = buildUserContent(lines, 'ambient', 'smart', {
      turn: {
        speaker: 'S2',
        text: 'Can you make me a linked list in JavaScript?',
        kind: 'request',
        addressee: 'me',
      },
    })
    expect(prompt).toContain(
      'Respond to this completed turn (a request):\nS2: Can you make me a linked list in JavaScript?',
    )
    expect(prompt).toContain('Answer THAT turn, about the topic being discussed now.')
    expect(prompt.indexOf('Respond to this completed turn')).toBeLessThan(
      prompt.indexOf('concrete ask for code'),
    )
    expect(buildUserContent(lines, 'hotkey', 'smart')).not.toContain('Respond to this completed')
  })

  it('lets an open-floor question yield a suggestion only if it is genuinely useful', () => {
    const prompt = buildUserContent(window, 'ambient', 'smart', {
      turn: {
        speaker: 'S1',
        text: 'So any questions about the use of these models?',
        kind: 'question',
        addressee: 'room',
      },
    })
    expect(prompt).toContain('It was put to the room, not to Me specifically.')
    expect(prompt).toContain('otherwise output\nexactly <none>')
  })

  it('includes recently shown suggestions so automatic answers do not repeat them', () => {
    const recent = [
      'I’ll verify AS9 writeback in sandbox after the catalog change; report back.',
      'Ask which context window the catalog lists.',
    ]
    const prompt = buildUserContent(window, 'ambient', 'smart', { recent })
    expect(prompt).toContain(
      '- I’ll verify AS9 writeback in sandbox after the catalog change; report back.\n- Ask which context window the catalog lists.',
    )
    expect(prompt).toContain('Do not repeat or re-assert these.')
    expect(prompt).toContain('output exactly <none>')
    // a requested answer always answers: no recent list, no no-op
    expect(buildUserContent(window, 'hotkey', 'smart')).not.toContain('<none>')
  })

  it('treats job context as background, not a topic to steer back to', () => {
    const system = buildSystemPrompt(
      {
        id: 1,
        name: 'Acme',
        companyInfo: '',
        projectScope: '',
        notes: 'Verify AS9 writeback in sandbox.',
        talkingPoints: 'Catalog change',
        persona: '',
        summaryEmail: '',
        createdAt: '',
        archived: false,
      },
      [],
    )
    expect(system).toContain('never a default topic')
    expect(system).toContain(
      'Talking points (raise only when the current topic makes them relevant)',
    )
    expect(system).not.toContain('steer toward these')
  })

  it('always includes the compact output contract', () => {
    const prompt = buildUserContent(window, 'ambient', 'smart')
    expect(prompt).toContain('Line 1 is one bold headline')
    expect(prompt).toContain('Optionally include ONE fenced code block')
    expect(prompt).toContain('at most 2 short follow-up lines')
    expect(prompt).toContain('No headings, bullet walls, preamble')
  })
})

describe('knowledge summary prompt', () => {
  it('requests durable, grounded knowledge with the required optional sections', () => {
    const prompt = buildSummaryPrompt([
      { speaker: 0, isUser: false, text: 'Use branch feat/catalog-v2 in sandbox.' },
      { speaker: -1, isUser: true, text: 'I will verify that by Friday.' },
    ])

    expect(prompt).toContain('Extract durable knowledge the user can rely on weeks later')
    expect(prompt).toContain('Do not merely recap')
    expect(prompt).toContain('Never invent')
    expect(prompt).toContain('Preserve\ntechnical tokens exactly as spoken')
    expect(prompt).toContain('**Overview**')
    expect(prompt).toContain('**Decisions**')
    expect(prompt).toContain('**What we learned**')
    expect(prompt).toContain('**Specifics**')
    expect(prompt).toContain('**Open questions / unverified**')
    expect(prompt).toContain('**People & roles**')
    expect(prompt).toContain('Include owner (if known), task, and\ndue date (if stated)')
    expect(prompt).toContain('Leave this section empty when there are no action items')
  })

  it('scales the output ceiling with transcript size and keeps long input bounded', () => {
    const short = [{ speaker: 0, isUser: false, text: 'A short meeting.' }]
    const long = [{ speaker: 0, isUser: false, text: 'x'.repeat(SUMMARY_CHARS * 2) }]

    expect(summaryMaxTokens(short)).toBe(1500)
    expect(summaryMaxTokens(long)).toBe(8000)
    expect(buildSummaryPrompt(long).length).toBeLessThan(SUMMARY_CHARS + 5000)
  })
})
