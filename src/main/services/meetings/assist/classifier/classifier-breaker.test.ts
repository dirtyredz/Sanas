import { describe, expect, it } from 'vitest'
import {
  ClassifierBreaker,
  CLASSIFIER_SUSPEND_AFTER,
  CLASSIFIER_SUSPEND_MS,
} from './classifier-breaker'

function harness() {
  let t = 0
  let timer: (() => void) | undefined
  const logs: string[] = []
  let changes = 0
  const breaker = new ClassifierBreaker({
    now: () => t,
    setTimer: (fn) => {
      timer = fn
      return 1
    },
    clearTimer: () => {
      timer = undefined
    },
    availabilityChanged: () => changes++,
    log: (m) => logs.push(m),
  })
  return {
    breaker,
    logs,
    changes: () => changes,
    advance: (ms: number) => (t += ms),
    fireTimer: () => timer?.(),
    hasTimer: () => timer !== undefined,
  }
}

describe('ClassifierBreaker', () => {
  it('suspends after consecutive provider/timeout failures and logs once', () => {
    const h = harness()
    for (let i = 0; i < CLASSIFIER_SUSPEND_AFTER; i++) {
      expect(h.breaker.suspended()).toBe(false)
      h.breaker.recordFailure(i % 2 ? 'timeout' : 'provider', {})
    }
    expect(h.breaker.suspended()).toBe(true)
    expect(h.logs.at(-1)).toContain('suspended 30s')
    expect(h.changes()).toBe(1)
    h.advance(CLASSIFIER_SUSPEND_MS)
    expect(h.breaker.suspended()).toBe(false)
  })

  it('a success resets the count', () => {
    const h = harness()
    h.breaker.recordFailure('provider', {})
    h.breaker.recordFailure('provider', {})
    h.breaker.recordSuccess()
    h.breaker.recordFailure('provider', {})
    expect(h.breaker.suspended()).toBe(false)
  })

  it('other failure reasons never count toward suspension', () => {
    const h = harness()
    for (let i = 0; i < 5; i++) h.breaker.recordFailure('malformed', {})
    expect(h.breaker.suspended()).toBe(false)
  })

  it('throttles failure logs to one per suspension window', () => {
    const h = harness()
    h.breaker.recordFailure('malformed', { shape: 'x' })
    h.breaker.recordFailure('malformed', {})
    expect(h.logs).toHaveLength(1)
    h.advance(CLASSIFIER_SUSPEND_MS)
    h.breaker.recordFailure('malformed', {})
    expect(h.logs).toHaveLength(2)
  })

  it('the recovery timer and reset clear the suspension and announce availability', () => {
    const h = harness()
    for (let i = 0; i < CLASSIFIER_SUSPEND_AFTER; i++) h.breaker.recordFailure('provider', {})
    expect(h.hasTimer()).toBe(true)
    h.fireTimer()
    expect(h.breaker.suspended()).toBe(false)
    expect(h.changes()).toBe(2)
  })
})
