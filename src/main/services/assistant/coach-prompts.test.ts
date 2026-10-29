import { describe, expect, it } from 'vitest'
import { COACH_PROFILE, buildCoachUserContent, isCoachNoop } from './coach-prompts'

const window = [
  { speaker: 0, isUser: false, text: 'How does the export API respond?' },
  { speaker: -1, isUser: true, text: 'It returns 200 when the job is done.' },
]

describe('coach prompts', () => {
  it('includes the explanation, the reason, recent coaching and the compact contract', () => {
    const prompt = buildCoachUserContent({
      window,
      excerpt: 'It returns 200 when the job is done.',
      reason: 'pause',
      recentCoach: ['**Mention the retry header.**'],
    })
    expect(prompt).toContain('S1: How does the export API respond?')
    expect(prompt).toContain('Me: It returns 200')
    expect(prompt).toContain('Current explanation by Me (Me has paused')
    expect(prompt).toContain('- **Mention the retry header.**')
    expect(prompt).toContain('return exactly NONE')
    expect(prompt).toContain('Line 1 is one bold headline')
  })

  it('bounds the transcript and keeps at most three recent suggestions within 1,000 chars', () => {
    const long = Array.from({ length: 400 }, (_, i) => ({
      speaker: 1,
      isUser: false,
      text: `line ${i} ${'x'.repeat(40)}`,
    }))
    const recent = ['first', 'second', 'third', 'fourth'].map((w) => `**${w}** ${'y'.repeat(200)}`)
    const prompt = buildCoachUserContent({
      window: long,
      excerpt: 'z',
      reason: 'long',
      recentCoach: recent,
    })
    expect(prompt).not.toContain('line 0 ')
    expect(prompt).toContain('line 399 ')
    expect(prompt).not.toContain('**first**')
    expect(prompt).toContain('**fourth**')
    const recentBlock = prompt.slice(
      prompt.indexOf('(do not repeat):') + 17,
      prompt.indexOf('\n\n---\nMe is'),
    )
    expect(recentBlock.length).toBeLessThanOrEqual(1_000)
  })

  it('has its own short profile whatever the whisper mode', () => {
    expect(COACH_PROFILE).toEqual({
      maxTokens: 220,
      effort: 'low',
      timeoutMs: 8_000,
      maxRetries: 0,
    })
    // the prompt takes no whisper mode at all, so none of the answer instructions leak in
    const prompt = buildCoachUserContent({ window, excerpt: 'x', reason: 'long', recentCoach: [] })
    expect(prompt).not.toContain('concrete ask for code')
    expect(prompt).not.toContain('Give the actual answer')
    expect(prompt).toContain('(none yet)')
  })

  it('treats empty and NONE as a no-op', () => {
    for (const t of ['', '  ', 'NONE', 'none', '**NONE**', 'NONE.'])
      expect(isCoachNoop(t)).toBe(true)
    expect(isCoachNoop('**Next, cover the status endpoint.**')).toBe(false)
  })
})
