import { describe, expect, it } from 'vitest'
import {
  assistProfile,
  buildSummaryPrompt,
  buildSystemPrompt,
  buildUserContent,
  SUMMARY_CHARS,
  summaryMaxTokens,
  type TranscriptLine,
  CURRENT_QUESTION_RULE,
} from './prompts'
import {
  BACKGROUND_CHARS,
  BACKGROUND_LABEL,
  CURRENT_EXCHANGE_LABEL,
} from './answer-context/conversation-window'
import {
  carriedTerms,
  TOPIC_SWITCH_EXCHANGES,
  TOPIC_SWITCH_JOB,
  topicSwitchWindow,
} from './answer-context/testing/topic-switch'

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

  it('includes stories already told so answers do not re-tell them', () => {
    const told = [
      { headline: 'I’ll verify AS9 writeback in sandbox after the catalog change.', detail: '' },
      { headline: 'Ask which context window the catalog lists.', detail: 'It sets the cap.' },
    ]
    const prompt = buildUserContent(window, 'ambient', 'smart', { told })
    expect(prompt).toContain(
      '- I’ll verify AS9 writeback in sandbox after the catalog change.\n- Ask which context window the catalog lists. / It sets the cap.',
    )
    expect(prompt).toContain('Do not re-tell these stories')
    expect(prompt).toContain('output exactly <none>')
    // a requested answer sees the same list but always answers: no no-op
    const hotkey = buildUserContent(window, 'hotkey', 'smart', { told })
    expect(hotkey).toContain('Do not re-tell these stories')
    expect(hotkey).toContain('You must still answer the current question.')
    expect(hotkey).not.toContain('<none>')
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
    expect(prompt).toContain(
      'Only when the ask requests implementation or requires an exact artifact',
    )
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

describe('buildUserContent: stacked questions', () => {
  it('lists carried questions in order and asks for one combined suggestion', () => {
    const prompt = buildUserContent([], 'ambient', 'smart', {
      turn: {
        speaker: 'S2',
        text: 'Who owns the rollout?',
        kind: 'question',
        addressee: 'me',
        earlier: [{ speaker: 'S2', text: 'What is the delivery date?' }],
      },
    })
    expect(prompt).toContain('1. S2: What is the delivery date?\n2. S2: Who owns the rollout?')
    expect(prompt).toMatch(/Address EACH one, briefly and in\s+order, in ONE suggestion/)
    expect(prompt).not.toContain('Respond to this completed turn')
  })
})

describe('topic switch: answers anchor on the current question (DECISIONS 2026-11-04)', () => {
  const ex = TOPIC_SWITCH_EXCHANGES[2]
  const { window: lines, question } = topicSwitchWindow(2)
  const turn = {
    speaker: 'S1',
    text: ex.question,
    kind: 'question' as const,
    addressee: 'me' as const,
    startMs: question.startMs,
  }

  it('isolates the current question and keeps the earlier story only as capped background', () => {
    const prompt = buildUserContent(lines, 'ambient', 'smart', { turn })
    const background = prompt.slice(
      prompt.indexOf(BACKGROUND_LABEL),
      prompt.indexOf(CURRENT_EXCHANGE_LABEL),
    )
    const current = prompt.slice(prompt.indexOf(CURRENT_EXCHANGE_LABEL), prompt.indexOf('---'))
    expect(current).toContain(`S1: ${ex.question}`)
    expect(current).not.toMatch(/subgraph|kafka|federat/i)
    expect(background).toContain('background only')
    expect(background.length).toBeLessThanOrEqual(BACKGROUND_LABEL.length + BACKGROUND_CHARS + 4)
    expect(prompt).toContain('Answer the technology and subject THAT question names')
    expect(prompt).not.toContain('Rolling transcript')
  })

  it('states the match-the-asked-technology rule in the system prompt', () => {
    const system = buildSystemPrompt(TOPIC_SWITCH_JOB, [])
    expect(system).toContain(CURRENT_QUESTION_RULE)
    expect(system).toContain('Earlier turns are background')
    expect(system).toContain('continue Me')
    expect(system).toContain('Factual or inventory checks')
    expect(system).toContain('never invent the rest of it')
  })

  it('picks the best untold resume role and keeps factual checks to 40 words', () => {
    const system = buildSystemPrompt(TOPIC_SWITCH_JOB, [])
    expect(system).toContain('appears in several resume roles')
    expect(system).toContain('answer at the level of the technology')
    expect(system).toContain('refers back')
    expect(system).toContain('40\nwords or fewer in total')
    expect(buildUserContent(lines, 'ambient', 'smart', { turn })).toContain(
      'never more than 40 words in total for factual or inventory checks',
    )
  })

  it('scores carryover: a bare employer is strict-only, a referenced exchange is exempt', () => {
    const aws = TOPIC_SWITCH_EXCHANGES[1]
    expect(carriedTerms('At Acme our services ran on EKS.', aws)).toEqual([])
    expect(carriedTerms('At Acme our services ran on EKS.', aws, { strict: true })).toEqual([
      'acme',
    ])
    expect(carriedTerms('The subgraph used Kafka.', aws)).toEqual(['subgraph', 'kafka'])
    const test = TOPIC_SWITCH_EXCHANGES[5]
    expect(carriedTerms('Replay Kafka events.', test)).toEqual(['kafka'])
    expect(carriedTerms('Replay Kafka events.', test, { referenced: 'a Kafka consumer' })).toEqual(
      [],
    )
  })

  it('marks a question still being spoken as possibly cut off, without inventing the rest', () => {
    const cut = TOPIC_SWITCH_EXCHANGES[3]
    const at = topicSwitchWindow(3)
    const prompt = buildUserContent(at.window, 'hotkey', 'smart', {
      latest: { speaker: 'S1', text: cut.cutQuestion!, startMs: at.question.startMs, open: true },
    })
    expect(prompt).toContain(
      `The most recent question (Me asked for an answer to it now):\nS1: ${cut.cutQuestion}`,
    )
    expect(prompt).toContain('do\nnot invent the rest of the question')
    expect(prompt).toContain(CURRENT_EXCHANGE_LABEL)
  })
})
