import { describe, expect, it } from 'vitest'
import { COACH_INSTRUCTION, COACH_PROFILE, buildCoachUserContent } from './coach-prompts'
import { BACKGROUND_LABEL } from '../answer-context/conversation-window'
import { TOPIC_SWITCH_EXCHANGES, topicSwitchWindow } from '../answer-context/testing/topic-switch'

const window = [
  { speaker: 0, isUser: false, text: 'How does the export API respond?' },
  { speaker: -1, isUser: true, text: 'It returns 200 when the job is done.' },
]

describe('coach prompts', () => {
  it('includes the explanation, the reason, shown headlines and the compact contract', () => {
    const prompt = buildCoachUserContent({
      window,
      excerpt: 'It returns 200 when the job is done.',
      reason: 'pause',
      recent: ['Mention the retry header.'],
    })
    expect(prompt).toContain('S1: How does the export API respond?')
    expect(prompt).toContain('Me: It returns 200')
    expect(prompt).toContain('Current explanation by Me (Me has paused')
    expect(prompt).toContain('- Mention the retry header.')
    expect(prompt).toContain('Do not repeat or re-assert these')
    expect(prompt).toContain('output exactly <none>')
    expect(prompt).toContain('never a topic to steer back to')
    expect(prompt).toContain('Line 1 is one bold headline')
  })

  it('bounds the transcript and keeps only the last three shown headlines', () => {
    const long = Array.from({ length: 400 }, (_, i) => ({
      speaker: 1,
      isUser: false,
      text: `line ${i} ${'x'.repeat(40)}`,
    }))
    const prompt = buildCoachUserContent({
      window: long,
      excerpt: 'z',
      reason: 'long',
      recent: ['first', 'second', 'third', 'fourth'],
    })
    expect(prompt).not.toContain('line 0 ')
    expect(prompt).toContain('line 399 ')
    expect(prompt).not.toContain('- first')
    expect(prompt).toContain('- second\n- third\n- fourth')
  })

  it('never introduces new technologies and labels the earlier conversation as background', () => {
    const { window: lines, question } = topicSwitchWindow(3, 1)
    const prompt = buildCoachUserContent({
      window: lines,
      excerpt: TOPIC_SWITCH_EXCHANGES[3].reply[0],
      reason: 'pause',
      recent: [],
      question: {
        speaker: 'S1',
        text: TOPIC_SWITCH_EXCHANGES[3].question,
        startMs: question.startMs,
      },
    })
    expect(COACH_INSTRUCTION).toContain(
      'Never introduce a technology, tool, employer or project Me has not mentioned in this answer',
    )
    expect(COACH_INSTRUCTION).not.toContain('job-note fact')
    expect(prompt.startsWith(BACKGROUND_LABEL)).toBe(true)
    expect(prompt).toContain(
      'Question Me is answering:\nS1: Talk to me about some Node services you built recently.',
    )
    // the question and Me's reply are not repeated inside the background
    const background = prompt.slice(0, prompt.indexOf('---'))
    expect(background).not.toContain('Node services')
    expect(background).not.toContain('Initech')
  })

  it('has its own short profile whatever the whisper mode', () => {
    expect(COACH_PROFILE).toEqual({
      maxTokens: 220,
      effort: 'low',
      timeoutMs: 8_000,
      maxRetries: 0,
    })
    // the prompt takes no whisper mode at all, so none of the answer instructions leak in
    const prompt = buildCoachUserContent({ window, excerpt: 'x', reason: 'long', recent: [] })
    expect(prompt).not.toContain('concrete ask for code')
    expect(prompt).not.toContain('Give the actual answer')
    expect(prompt).toContain('(none yet)')
  })
})
