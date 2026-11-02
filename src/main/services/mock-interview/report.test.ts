import { expect, it } from 'vitest'
import { liveTurnReport } from './report'
import type { LiveTurn } from './engine'
import type { RequestOutcome } from '../meetings/assist/outcomes'

it('reports delayed suggestions by audio span, redacts answers and retains missing-answer evidence', () => {
  const turns: LiveTurn[] = [
    {
      id: 'a',
      topicId: 'one',
      text: 'When can we ship?',
      fallback: false,
      followUp: false,
      startedMs: 0,
      finalMs: 2000,
      spans: [{ startMs: 0, endMs: 1000 }],
    },
    {
      id: 'b',
      topicId: 'two',
      text: 'Why?',
      fallback: true,
      followUp: false,
      startedMs: 3000,
      finalMs: 5000,
      spans: [{ startMs: 3000, endMs: 4000 }],
    },
    {
      id: 'c',
      topicId: 'three',
      text: 'What next?',
      fallback: false,
      followUp: false,
      startedMs: 6000,
      spans: [],
    },
  ]
  const request: RequestOutcome = {
    id: 1,
    purpose: 'answer',
    stepIds: [],
    turnSpans: [{ startMs: 0, endMs: 1000 }],
    atMs: 2500,
    firstVisibleMs: 3500,
    completedMs: 6000,
    deliveredMs: 6100,
    status: 'completed',
    answer: 'Private suggestion text',
  }
  const result = liveTurnReport(
    turns,
    [request],
    [
      {
        atMs: 5100,
        event: 'classifier-rejected',
        reason: 'none',
        span: { startMs: 3000, endMs: 4000 },
      },
    ],
  )
  expect(result[0]).toMatchObject({
    producedSuggestion: true,
    firstVisibleLatencyMs: 1500,
    completionLatencyMs: 4100,
  })
  expect(JSON.stringify(result)).not.toContain('Private suggestion text')
  expect(result[0].requests[0].proseWords).toBe(3)
  expect(result[1].evidence[0].reason).toBe('none')
  expect(result[1].producedSuggestion).toBe(false)
  expect(result[2].observation).toBe('no-loopback-final-observed')
})
