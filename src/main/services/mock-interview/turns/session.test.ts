import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MockSession, type MockSessionDeps } from './session'
import { cannedInterviewer } from './interviewer'
import type { LivePlan } from '../plan'
import type { MockState } from '@shared/mock-interview/types'
import type { MeetingObservation } from '../../meetings/observation'
import type { RunObservation } from '../../meetings/assist/run-observation'

const plan: LivePlan = {
  version: 1,
  mode: 'live',
  name: 'Test',
  persona: 'Client',
  durationMs: 30000,
  silenceMs: 500,
  topics: [
    { id: 'one', question: 'When can we ship?', maxFollowUps: 0 },
    { id: 'two', question: 'Why Friday?', maxFollowUps: 0, screen: 'dashboard' },
  ],
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
function setup(overrides: Partial<MockSessionDeps> = {}) {
  let meeting!: (e: MeetingObservation) => void, run!: (e: RunObservation) => void
  let closed!: () => void
  const unsubscribe = vi.fn()
  const publish = vi.fn<(s: MockState) => void>()
  const deps: MockSessionDeps = {
    start: vi.fn(async () => ({ status: 'live' as const, meetingId: 7 })),
    stop: vi.fn(async () => {}),
    audioNow: () => 0,
    now: () => Date.now(),
    open: vi.fn(async (cb) => {
      closed = cb
    }),
    close: vi.fn(),
    controls: vi.fn(() => unsubscribe),
    subscribeMeeting: (fn) => {
      meeting = fn
      return unsubscribe
    },
    subscribeRuns: (fn) => {
      run = fn
      return unsubscribe
    },
    subscribeAssistance: () => unsubscribe,
    share: (name) => 'data:' + name,
    publish,
    save: vi.fn(),
    ...overrides,
  }
  const session = new MockSession(plan, cannedInterviewer, deps)
  return {
    session,
    deps,
    publish,
    unsubscribe,
    close: () => closed(),
    meeting: (e: MeetingObservation) => meeting(e),
    run: (e: RunObservation) => run(e),
    ack: () => {
      const speech = session.state().speech
      if (speech) session.acknowledge(speech.id, true)
    },
    final: (isUser: boolean, text: string, isFinal = true) =>
      meeting({
        kind: 'transcript',
        role: isUser ? 'user' : 'other',
        value: {
          meetingId: 7,
          isUser,
          isFinal,
          text,
          speaker: isUser ? -1 : 0,
          tStartMs: 1,
          tEndMs: 100,
        },
      }),
  }
}

it('starts normal capture once, persists only final conversation evidence, shares, and closes both on End', async () => {
  const f = setup()
  await f.session.start(9)
  await vi.advanceTimersByTimeAsync(0)
  expect(f.deps.start).toHaveBeenCalledWith(9)
  expect(f.session.state().status).toBe('speaking')
  f.ack()
  await vi.advanceTimersByTimeAsync(0)
  f.final(false, 'When can we ship?')
  f.final(true, 'interim only', false)
  await vi.advanceTimersByTimeAsync(1000)
  expect(f.session.state().caption).toBe('Why Friday?') // interim user speech starts the answer
  f.final(true, 'Friday.')
  await vi.advanceTimersByTimeAsync(500)
  expect(f.session.state().share).toBe('data:dashboard')
  expect(JSON.stringify(vi.mocked(f.deps.save).mock.calls)).not.toContain('interim only')
  f.close()
  await vi.advanceTimersByTimeAsync(100)
  expect(f.session.state()).toMatchObject({ status: 'ended', speech: null, share: null })
  expect(f.deps.stop).toHaveBeenCalledOnce()
  expect(f.deps.close).toHaveBeenCalledOnce()
  expect(f.unsubscribe).toHaveBeenCalledTimes(4)
  expect(vi.getTimerCount()).toBe(0)
})

it('records first-visible/completion/counts for late suggestions without passing their text to the interviewer', async () => {
  const f = setup()
  await f.session.start(9)
  await vi.advanceTimersByTimeAsync(0)
  f.ack()
  await vi.advanceTimersByTimeAsync(0)
  f.final(false, 'When can we ship?')
  f.run({
    kind: 'begin',
    id: 1,
    meetingId: 7,
    purpose: 'answer',
    spans: [{ startMs: 1, endMs: 100, completedAt: 0 }],
  })
  await vi.advanceTimersByTimeAsync(100)
  const event = {
    meetingId: 7,
    suggestionId: 1,
    purpose: 'answer' as const,
    trigger: 'ambient' as const,
    text: 'Secret suggestion',
  }
  f.run({ kind: 'visible', event: { ...event, kind: 'delta' } })
  await f.session.end()
  await vi.advanceTimersByTimeAsync(100)
  f.run({ kind: 'visible', event: { ...event, kind: 'done' } })
  f.run({ kind: 'settled', id: 1, meetingId: 7, outcome: 'done' })
  expect(f.session.state().result?.questions[0]).toMatchObject({
    producedSuggestion: true,
    firstVisibleLatencyMs: 100,
    completionLatencyMs: 200,
    words: 2,
  })
  expect(JSON.stringify(f.session.state())).not.toContain('Secret suggestion')
  await vi.advanceTimersByTimeAsync(100)
  expect(vi.getTimerCount()).toBe(0)
})

it('window failure ends the created meeting and reports setup failure', async () => {
  const f = setup({
    open: async () => {
      throw new Error('Window unavailable')
    },
  })
  await expect(f.session.start(9)).rejects.toThrow('Window unavailable')
  expect(f.deps.stop).toHaveBeenCalledOnce()
  expect(f.session.state()).toMatchObject({ status: 'ended', error: 'Window unavailable' })
  expect(vi.getTimerCount()).toBe(0)
})
it('stale speech ACK cannot complete a newer question; output failure ends capture', async () => {
  const f = setup()
  await f.session.start(9)
  await vi.advanceTimersByTimeAsync(0)
  f.session.acknowledge(999, true)
  expect(f.session.state().speech).not.toBeNull()
  f.session.acknowledge(f.session.state().speech!.id, false)
  await vi.advanceTimersByTimeAsync(200)
  expect(f.session.state()).toMatchObject({ status: 'ended', result: { reason: 'output-failed' } })
  expect(f.deps.stop).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
it('a forced meeting pause ends the mock and releases output', async () => {
  const f = setup()
  await f.session.start(9)
  f.meeting({ kind: 'state', value: { status: 'paused', meetingId: 7, error: 'Disconnected' } })
  await vi.advanceTimersByTimeAsync(200)
  expect(f.session.state().result?.reason).toBe('capture-failed')
  expect(f.deps.stop).toHaveBeenCalledOnce()
})

it('End during meeting setup stops the eventual meeting without opening an orphan window', async () => {
  let complete!: (state: { status: 'live'; meetingId: number }) => void
  const f = setup({
    start: () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  })
  const start = f.session.start(9)
  await f.session.end()
  complete({ status: 'live', meetingId: 7 })
  await start
  expect(f.deps.stop).toHaveBeenCalledOnce()
  expect(f.deps.open).not.toHaveBeenCalled()
  expect(f.session.state().status).toBe('ended')
  expect(vi.getTimerCount()).toBe(0)
})
