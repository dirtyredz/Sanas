import { vi } from 'vitest'
import type { SuggestionEvent } from '@shared/types'
import type { AssistRequest } from '../../../assistant/types'
import type { ClassifierOutcome, ClassifyRequest } from '../../../assistant/classifier'
import type { TurnFinal } from '../../../turns/types'
import { CONTINUATION_GRACE_MS } from '../../../turns/turn-assembler'
import { LiveAssistance } from '../live-assistance'
import { SuggestionRunner } from '../suggestion-runner'
import type { AssistSettings } from '../suggestion-requests'
import type { ToldStory } from '../../../assistant/answer-context/told-stories'

// Shared fake-clock harness for the live-assistance suites. Each suite mocks ./diagnostics
// itself (vi.mock is hoisted per test file). Providers resolve only when a test says so.

export interface Deferred<T> {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
}

export function deferred<T>(): Deferred<T> {
  let resolve: (v: T) => void = () => undefined
  let reject: (e: unknown) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** `speculate` off pins the ordinary post-verdict path these suites were written for; the
 *  speculation suite (live-assistance-speculation.test.ts) turns it on. */
export function setup(over: Partial<AssistSettings> = {}, opts: { speculate?: boolean } = {}) {
  const settings: AssistSettings = {
    anthropicApiKey: 'sk',
    anthropicWorkspaceId: '',
    nudgeModel: 'claude-sonnet-5-5',
    answerModel: 'claude-opus-5-5',
    classifierModel: 'claude-haiku-5-5',
    whisperMode: 'smart',
    nudgeCooldownSec: 5,
    coachWhileTalking: false,
    ...over,
  }
  const classifications: { req: ClassifyRequest; d: Deferred<ClassifierOutcome> }[] = []
  const generations: { req: AssistRequest; d: Deferred<string> }[] = []
  const events: SuggestionEvent[] = []
  /** Fake-clock time of each event, parallel to `events`. */
  const eventAt: number[] = []
  const stored: unknown[] = []
  const logs: string[] = []
  let holds = 0
  let availabilityChanges = 0
  let snapshotAvailable = true
  const runner = new SuggestionRunner({
    provider: {
      complete: (req) => {
        const d = deferred<string>()
        generations.push({ req, d })
        req.signal?.addEventListener('abort', () => d.reject(new Error('aborted')))
        return d.promise
      },
    },
    emit: (e) => {
      events.push(e)
      eventAt.push(Date.now())
    },
    persist: (row) => {
      stored.push(row)
    },
    hold: () => holds++,
    release: () => holds--,
    log: () => undefined,
    now: () => Date.now(), // the same fake clock as the coordinator, for stage evidence
  })
  const window: { speaker: number; isUser: boolean; text: string; tStartMs?: number }[] = []
  const recent: string[] = []
  const told: ToldStory[] = []
  const assist = new LiveAssistance({
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    settings: () => settings,
    classify: (req) => {
      const d = deferred<ClassifierOutcome>()
      classifications.push({ req, d })
      return d.promise
    },
    runner: opts.speculate
      ? runner
      : {
          canStart: (t) => runner.canStart(t),
          start: (r) => runner.start(r),
          speculate: () => null,
        },
    snapshot: () =>
      snapshotAvailable
        ? {
            meetingId: 7,
            atMs: 1_000,
            system: 'sys',
            window,
            names: undefined,
            recent,
            told,
          }
        : null,
    log: (m) => logs.push(m),
    availabilityChanged: () => availabilityChanges++,
  })
  assist.start()
  const classify = async (i: number, outcome: ClassifierOutcome): Promise<void> => {
    classifications[i].d.resolve(outcome)
    await vi.advanceTimersByTimeAsync(0)
  }
  const question: ClassifierOutcome = { status: 'classified', kind: 'question', addressee: 'me' }
  const none: ClassifierOutcome = { status: 'classified', kind: 'none' }
  return {
    assist,
    setSnapshotAvailable: (available: boolean) => {
      snapshotAvailable = available
    },
    settings,
    classifications,
    generations,
    events,
    eventAt,
    window,
    recent,
    told,
    classify,
    question,
    none,
    runner,
    stored,
    logs,
    holds: () => holds,
    availabilityChanges: () => availabilityChanges,
  }
}

export const them = (text: string, tStartMs: number, tEndMs: number, speaker = 1): TurnFinal => ({
  channel: 0,
  speaker,
  role: 'other',
  tStartMs,
  tEndMs,
  text,
})

export const me = (text: string, tStartMs: number, tEndMs: number): TurnFinal => ({
  channel: 0,
  speaker: 0,
  role: 'user',
  tStartMs,
  tEndMs,
  text,
})

/** A complete other-speaker turn: final + endpoint + grace. */
export async function otherTurn(
  assist: LiveAssistance,
  text: string,
  startMs: number,
  endMs: number,
  speaker = 1,
): Promise<void> {
  assist.final(them(text, startMs, endMs, speaker))
  assist.boundary(0, endMs, 'endpoint')
  await vi.advanceTimersByTimeAsync(CONTINUATION_GRACE_MS)
}

export const words = (n: number): string => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')
