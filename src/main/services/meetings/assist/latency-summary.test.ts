import { describe, expect, it } from 'vitest'
import type { LatencyRecord } from './latency'
import { summarizeLatency } from './latency-summary'

describe('latency summary', () => {
  it('summarizes by verdict and path, keeping failures and missing usage apart', () => {
    const records: LatencyRecord[] = [
      { kind: 'candidate', classification: 'applies', verdict: 'none' },
      {
        kind: 'run',
        classification: 'applies',
        path: 'speculative',
        verdict: 'request room',
        outcome: 'done',
        closeToFirstReadableMs: 1_000,
        usage: { partial: false, outputCount: 3 },
      },
      {
        kind: 'run',
        classification: 'applies',
        path: 'speculative',
        verdict: 'request room',
        outcome: 'done',
        closeToFirstReadableMs: 2_000,
      },
      {
        kind: 'run',
        classification: 'applies',
        path: 'speculative',
        verdict: 'question me',
        outcome: 'discarded',
        discard: 'prompt-changed',
      },
      {
        kind: 'run',
        classification: 'applies',
        path: 'fallback',
        verdict: 'question me',
        outcome: 'timeout',
      },
    ]
    const s = summarizeLatency(records, 2)
    expect(s.byVerdictAndPath).toEqual({
      'request room · speculative': expect.objectContaining({
        count: 2,
        closeToFirstReadableMs: 1_500,
      }),
    })
    expect(s.classifier).toEqual({ none: 1, 'request room': 2, 'question me': 1 })
    expect(s.speculation).toEqual({
      started: 3,
      promoted: 2,
      discarded: 1,
      discardReasons: { 'prompt-changed': 1 },
    })
    expect(s).toMatchObject({ fallbacks: 1, missingUsage: 3, overflow: 2 })
  })
})
