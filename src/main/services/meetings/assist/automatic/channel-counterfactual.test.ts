import { afterEach, expect, it, vi } from 'vitest'
import { LiveAssistance } from './live-assistance'
import { resolveSpeakerIdentity } from '../../capture/channel-identity'
afterEach(() => vi.useRealTimers())
function setup(fail = false) {
  const classify = vi.fn(async () =>
    fail
      ? { status: 'failed' as const, reason: 'provider' as const }
      : { status: 'classified' as const, kind: 'question' as const, addressee: 'me' as const },
  )
  const start = vi.fn(() => null)
  const availabilityChanged = vi.fn()
  const assist = new LiveAssistance({
    now: () => Date.now(),
    setTimer: (f, ms) => setTimeout(f, ms),
    clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
    settings: () => ({
      anthropicApiKey: 'stub',
      anthropicWorkspaceId: '',
      nudgeModel: 'stub',
      answerModel: 'stub',
      classifierModel: 'stub',
      whisperMode: 'smart',
      nudgeCooldownSec: 0,
      coachWhileTalking: false,
    }),
    classify,
    runner: { canStart: () => true, start, speculate: () => null },
    snapshot: () => ({
      meetingId: 40,
      atMs: 13000,
      system: '',
      window: [{ speaker: 1, isUser: false, text: 'How many subgraphs did you run?' }],
      recent: [],
      told: [],
    }),
    log: () => {},
    availabilityChanged,
  })
  assist.start()
  return { assist, classify, start, availabilityChanged }
}
async function question(assist: LiveAssistance, channel: number, at = 0) {
  const who = resolveSpeakerIdentity(channel, 1, true)
  assist.final({
    channel,
    speaker: who.speaker,
    role: who.role,
    text: 'How many subgraphs did you run?',
    tStartMs: at,
    tEndMs: at + 1000,
  })
  assist.boundary(channel, at + 1000, 'endpoint')
  await vi.advanceTimersByTimeAsync(400)
}
it('the same question classifies and answers only on counterpart loopback, never stereo mic', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(10000)
  const counts: number[][] = []
  for (const channel of [0, 1]) {
    const s = setup()
    await question(s.assist, channel)
    counts.push([s.classify.mock.calls.length, s.start.mock.calls.length])
    s.assist.halt()
  }
  expect(counts).toEqual([
    [0, 0],
    [1, 1],
  ])
})
it('surfaces the 30-second suspension after 3 failures, keeps Answer now working, and recovers', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(10000)
  const s = setup(true)
  await question(s.assist, 1)
  await vi.advanceTimersByTimeAsync(1500)
  await question(s.assist, 1, 2000)
  expect(s.assist.automaticUnavailable()).toBe(false)
  await vi.advanceTimersByTimeAsync(1500)
  await question(s.assist, 1, 4000)
  expect(s.assist.automaticUnavailable()).toBe(true)
  expect(s.availabilityChanged).toHaveBeenCalledTimes(2)
  s.assist.answerNow()
  expect(s.start).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(30000)
  expect(s.assist.automaticUnavailable()).toBe(false)
  await question(s.assist, 1, 40000)
  expect(s.classify).toHaveBeenCalledTimes(4)
  s.assist.halt()
  expect(vi.getTimerCount()).toBe(0)
})
it('clears suspension timers when a meeting stops', async () => {
  vi.useFakeTimers()
  const s = setup(true)
  await question(s.assist, 1)
  s.assist.halt()
  expect(s.assist.automaticUnavailable()).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})
