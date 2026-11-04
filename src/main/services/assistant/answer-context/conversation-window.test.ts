import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_CHARS,
  BACKGROUND_LABEL,
  CURRENT_EXCHANGE_LABEL,
  renderConversation,
  splitAtExchange,
} from './conversation-window'
import { topicSwitchWindow } from './testing/topic-switch'

describe('conversation window split', () => {
  it('puts the question and what follows in the current exchange, earlier lines in background', () => {
    const { window, question } = topicSwitchWindow(2, 1)
    const { background, current } = splitAtExchange(window, question.startMs)
    expect(current[0].text).toBe('Other than Lambda, what services have you used?')
    expect(current).toHaveLength(2)
    expect(background.some((l) => l.text.includes('subgraph'))).toBe(true)
    expect(current.some((l) => l.text.includes('subgraph'))).toBe(false)
  })

  it('caps and labels the background, and keeps the current exchange whole', () => {
    const { window, question } = topicSwitchWindow(1)
    const text = renderConversation(window, question.startMs)
    const [bg, current] = text.split(CURRENT_EXCHANGE_LABEL)
    expect(bg.startsWith(BACKGROUND_LABEL)).toBe(true)
    expect(bg.length).toBeLessThanOrEqual(BACKGROUND_LABEL.length + BACKGROUND_CHARS + 4)
    // the opening of the long federation story fell out of the capped background
    expect(bg).not.toContain('At Acme Corp I owned the move')
    expect(current.trim()).toBe("S1: What's your level of experience with AWS?")
  })

  it('treats untimed lines before the exchange as background and says when nothing is earlier', () => {
    const lines = [
      { speaker: 0, isUser: false, text: 'untimed earlier' },
      { speaker: 0, isUser: false, text: 'Which cloud?', tStartMs: 5_000, tEndMs: 6_000 },
    ]
    const split = splitAtExchange(lines, 5_000)
    expect(split.background.map((l) => l.text)).toEqual(['untimed earlier'])
    expect(renderConversation(lines.slice(1), 5_000)).toContain(
      `${BACKGROUND_LABEL}\n(nothing earlier)`,
    )
  })

  it('falls back to the rolling window without an exchange start', () => {
    const { window } = topicSwitchWindow(1)
    const text = renderConversation(window, undefined)
    expect(text.startsWith('Rolling transcript (most recent last):')).toBe(true)
    expect(text).not.toContain(BACKGROUND_LABEL)
  })
})
