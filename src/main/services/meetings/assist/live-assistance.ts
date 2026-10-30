import { TurnAssembler } from '../../turns/turn-assembler'
import type { CompletedTurn, IdentityRole, TurnFinal } from '../../turns/types'
import { answerCooldownAllows, looksLikeResponseCandidate } from '../../assistant/triggers'
import type {
  ClassifierOutcome,
  ClassifierTurn,
  ClassifyRequest,
  Addressee,
  ResponseKind,
} from '../../assistant/classifier'
import { CoachPolicy } from '../../assistant/coach-policy'
import { speakerLabel } from '../../transcript-format'
import type { SuggestionHandle, SuggestionRunner } from './suggestion-runner'
import {
  answerRequest,
  coachRequest,
  type AssistSettings,
  type AssistSnapshot,
} from './suggestion-requests'

// Live assistance for one meeting at a time: turns resolved transcript events into
// automatic answers and next points.
//
//   finals → turn assembly → loose prefilter → classifier → freshness/cooldown → runner
//   the user's own finals → coach policy → (opt-in) next point
//
// It owns the timers and every cancellation; the orchestrator (../index.ts) owns the meeting
// and feeds it lifecycle calls and identity-resolved events. No SQL, no provider SDKs: the
// classifier, the runner, settings and the meeting snapshot are injected, which is also what
// lets the whole flow run under a fake clock in tests.
//
// Every invalidation (pause, stop, reconnect, pin change) bumps `epoch` and discards the
// unfinished turn and all pending automatic work; anything that resolves for an older epoch
// is ignored. Interims and VAD only ever count as activity — never as transcript text.

export const CANDIDATE_LIFETIME_MS = 6_000
export const CLASSIFIER_SPACING_MS = 1_000
export const CLASSIFIER_SUSPEND_MS = 30_000
/** New speech must pass the candidate's end by this much to count as "after" it. */
const AFTER_TOLERANCE_MS = 250
/** A user final this short ("yeah", "good question") is not the user answering yet. */
const USER_RESPONSE_MIN_WORDS = 3
const RECENT_TURNS = 3

export interface LiveAssistanceDeps {
  /** Monotonic receipt time, ms. */
  now(): number
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  settings(): AssistSettings
  classify(req: ClassifyRequest): Promise<ClassifierOutcome>
  runner: Pick<SuggestionRunner, 'canStart' | 'start'>
  /** The live meeting right now, or null when there is none. */
  snapshot(): AssistSnapshot | null
  log(message: string): void
}

interface Candidate {
  turn: CompletedTurn
  previous: CompletedTurn[]
  kind?: ResponseKind
  addressee?: Exclude<Addressee, 'other'>
  abort?: AbortController
  dropped: boolean
}

type TimerName = 'turn' | 'coach' | 'admit'

function words(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

export class LiveAssistance {
  private active = false
  private epoch = 0
  private assembler = new TurnAssembler()
  private coach = new CoachPolicy()
  private recentTurns: CompletedTurn[] = []
  private classifying: Candidate | null = null
  private queued: Candidate | null = null
  private ready: Candidate | null = null
  private lastClassifierStartAt: number | null = null
  private suspendedUntil = 0
  private lastAnswerAt: number | null = null
  private coachRun: SuggestionHandle | null = null
  private timers = new Map<TimerName, unknown>()
  private lastFailureLogAt = Number.NEGATIVE_INFINITY

  constructor(private deps: LiveAssistanceDeps) {}

  // ── lifecycle ──────────────────────────────────────────────────────────────────────

  /** A meeting started or resumed: transient state and cooldowns start over. */
  start(): void {
    this.guard(() => {
      this.invalidate()
      this.active = true
      this.coach.reset()
      this.recentTurns = []
      this.lastAnswerAt = null
      this.lastClassifierStartAt = null
      this.suspendedUntil = 0
    })
  }

  /** Pause or stop. Called BEFORE the socket shutdown is awaited, so nothing generates
   *  from speech the meeting is leaving behind. An answer already started still finishes. */
  halt(): void {
    this.guard(() => {
      this.active = false
      this.invalidate()
    })
  }

  /** The provider lost connection continuity: whatever was half-assembled is incomplete. */
  connectionReset(): void {
    this.guard(() => this.invalidate())
  }

  /** "That's me" changed: identities in flight are no longer trustworthy. Old turns are
   *  not re-triggered. */
  identityChanged(): void {
    this.guard(() => this.invalidate())
  }

  /** Assistance settings were saved. Disabling coaching cancels it at once. */
  settingsChanged(): void {
    this.guard(() => {
      if (!this.deps.settings().coachWhileTalking) this.stopCoaching()
      else if (this.active) this.evaluateCoach(this.deps.now())
    })
  }

  // ── transcript evidence ────────────────────────────────────────────────────────────

  final(f: TurnFinal): void {
    this.guard(() => {
      if (!this.active) return
      const now = this.deps.now()
      const { accepted, completed } = this.assembler.final(f, now)
      this.handleCompleted(completed, now)
      if (accepted) {
        this.dropOvertakenCandidates(f)
        if (f.role === 'user') {
          this.coach.userFinal(f, now)
        } else {
          this.coach.endEpisode() // another voice took the floor, or we cannot tell
          this.cancelCoach()
        }
        this.evaluateCoach(now)
      }
      this.scheduleTurnTimer(now)
    })
  }

  /** Speech activity (an interim or VAD event). `role` is the channel's identity in stereo
   *  and 'unknown' in mono, where activity says nothing about who is speaking. */
  activity(channel: number, atMs: number, role: IdentityRole): void {
    this.guard(() => {
      if (!this.active) return
      const now = this.deps.now()
      this.assembler.activity(channel, atMs, now)
      if (role === 'user') this.coach.userActivity(now)
      else if (role === 'other') this.cancelCoach()
      else this.coach.ambiguousActivity(now)
      this.scheduleTurnTimer(now)
      this.scheduleCoachTimer(now)
    })
  }

  boundary(channel: number, atMs: number, source: 'endpoint' | 'utterance-end'): void {
    this.guard(() => {
      if (!this.active) return
      const now = this.deps.now()
      this.assembler.boundary(channel, atMs, source, now)
      this.scheduleTurnTimer(now)
    })
  }

  // ── requested answers ──────────────────────────────────────────────────────────────

  /** "Answer now" / the assist hotkey: bypasses the prefilter and the classifier, and
   *  takes priority over an unpublished next point. */
  answerNow(): void {
    this.guard(() => {
      if (!this.deps.runner.canStart('hotkey')) return
      const snap = this.deps.snapshot()
      if (!snap || snap.window.length === 0) return
      this.cancelCoach()
      const handle = this.deps.runner.start(answerRequest(snap, this.deps.settings(), 'hotkey'))
      if (handle) this.afterRun(handle)
    })
  }

  // ── turns → candidates → classifier → answer ──────────────────────────────────────

  private handleCompleted(turns: CompletedTurn[], now: number): void {
    for (const turn of turns) {
      const previous = this.recentTurns.slice(-2)
      this.recentTurns = [...this.recentTurns, turn].slice(-RECENT_TURNS)
      if (turn.role === 'user') {
        this.coach.userTurnCompleted(now)
        continue
      }
      if (looksLikeResponseCandidate(turn.text)) this.admit({ turn, previous, dropped: false })
    }
  }

  private admit(c: Candidate): void {
    this.cancelCoach() // answer assistance has priority
    this.ready = null // a newer completed turn supersedes one still waiting for the lane
    this.queued = c // the newest only: never a queue
    this.tryClassify()
  }

  /** New finalized speech after a pending candidate means the moment has moved on: the
   *  original speaker resumed, someone else took over, or the user started answering. */
  private dropOvertakenCandidates(f: TurnFinal): void {
    for (const c of [this.classifying, this.queued, this.ready]) {
      if (!c || c.dropped) continue
      if (f.tEndMs <= c.turn.endMs + AFTER_TOLERANCE_MS) continue // the candidate's own late words
      if (f.role === 'user' && words(f.text) < USER_RESPONSE_MIN_WORDS) continue
      this.dropCandidate(c)
    }
  }

  private dropCandidate(c: Candidate): void {
    c.dropped = true
    c.abort?.abort()
    if (this.queued === c) this.queued = null
    if (this.ready === c) this.ready = null
  }

  private expired(c: Candidate, now: number): boolean {
    return now - c.turn.completedAt > CANDIDATE_LIFETIME_MS
  }

  private candidatePending(): boolean {
    return this.classifying !== null || this.queued !== null || this.ready !== null
  }

  private tryClassify(): void {
    const c = this.queued
    if (this.classifying || !c) return
    const now = this.deps.now()
    const s = this.deps.settings()
    if (
      this.expired(c, now) ||
      now < this.suspendedUntil ||
      !s.anthropicApiKey ||
      !answerCooldownAllows(this.lastAnswerAt, now, s.nudgeCooldownSec)
    ) {
      this.queued = null
      return
    }
    if (
      this.lastClassifierStartAt !== null &&
      now - this.lastClassifierStartAt < CLASSIFIER_SPACING_MS
    ) {
      this.setTimer('admit', this.lastClassifierStartAt + CLASSIFIER_SPACING_MS - now, () =>
        this.tryClassify(),
      )
      return
    }
    const snap = this.deps.snapshot()
    if (!snap) {
      this.queued = null
      return
    }
    this.queued = null
    this.classifying = c
    this.lastClassifierStartAt = now
    c.abort = new AbortController()
    const label = (t: CompletedTurn): ClassifierTurn => ({
      speaker: speakerLabel({ speaker: t.speaker, isUser: t.role === 'user' }, snap.names),
      text: t.text,
    })
    const epoch = this.epoch
    void this.deps
      .classify({
        apiKey: s.anthropicApiKey,
        workspaceId: s.anthropicWorkspaceId || undefined,
        model: s.classifierModel,
        current: label(c.turn),
        previous: c.previous.map(label),
        signal: c.abort.signal,
      })
      .catch((): ClassifierOutcome => ({ status: 'failed', reason: 'provider' }))
      .then((outcome) => this.guard(() => this.onClassified(c, epoch, outcome)))
  }

  private onClassified(c: Candidate, epoch: number, outcome: ClassifierOutcome): void {
    if (this.classifying === c) this.classifying = null
    if (epoch === this.epoch && !c.dropped) {
      if (outcome.status === 'failed') {
        if (outcome.reason === 'provider' || outcome.reason === 'timeout') {
          this.suspendedUntil = this.deps.now() + CLASSIFIER_SUSPEND_MS
        }
        this.logFailure(`turn classifier ${outcome.reason}; failing closed`)
      } else if (outcome.kind !== 'none' && outcome.addressee !== 'other') {
        // put to someone else: not Me's to answer. Me or the room: the prompt says which.
        c.kind = outcome.kind
        c.addressee = outcome.addressee
        this.ready = c
        this.tryGenerate()
      }
    }
    this.tryClassify()
    if (this.active) this.evaluateCoach(this.deps.now())
  }

  private tryGenerate(): void {
    const c = this.ready
    if (!c || !c.kind || !c.addressee) return
    const now = this.deps.now()
    const s = this.deps.settings()
    if (this.expired(c, now) || !answerCooldownAllows(this.lastAnswerAt, now, s.nudgeCooldownSec)) {
      this.ready = null
      return
    }
    if (!this.deps.runner.canStart('ambient')) return // retried when the lane frees
    const snap = this.deps.snapshot()
    this.ready = null
    if (!snap) return
    const handle = this.deps.runner.start(
      answerRequest(snap, s, 'ambient', {
        speaker: speakerLabel({ speaker: c.turn.speaker, isUser: false }, snap.names),
        text: c.turn.text,
        kind: c.kind,
        addressee: c.addressee,
      }),
    )
    if (!handle) return
    // consumed when an answer starts — and kept even if it declines with the no-op, so a
    // model with nothing new to say cannot be asked again and again
    this.lastAnswerAt = now
    this.afterRun(handle)
  }

  /** When any run ends its lane frees: a waiting candidate or a next point may go next. */
  private afterRun(handle: SuggestionHandle): void {
    void handle.done.finally(() =>
      this.guard(() => {
        this.tryGenerate()
        if (this.active) this.evaluateCoach(this.deps.now())
      }),
    )
  }

  // ── coaching ───────────────────────────────────────────────────────────────────────

  private evaluateCoach(now: number): void {
    const s = this.deps.settings()
    if (!this.active || !s.coachWhileTalking) {
      this.clearTimer('coach')
      return
    }
    this.scheduleCoachTimer(now)
    if (this.coachRun || this.candidatePending()) return
    if (!this.deps.runner.canStart('hotkey') || !this.deps.runner.canStart('ambient')) return
    if (!s.anthropicApiKey) return
    const reason = this.coach.decide(now, true)
    if (!reason) return
    const snap = this.deps.snapshot()
    if (!snap) return
    this.coach.attempted(now) // the cooldown runs from dispatch, failures included
    const epoch = this.epoch
    let handle: SuggestionHandle | null = null
    // the runner has already discarded the no-op; this is the "still current?" check
    const accept = (): boolean =>
      epoch === this.epoch && this.coachRun === handle && !this.candidatePending()
    handle = this.deps.runner.start(
      coachRequest(snap, s, { excerpt: this.coach.excerpt(), reason }, accept),
    )
    if (!handle) return
    const mine = handle
    this.coachRun = mine
    void mine.done.then(() =>
      this.guard(() => {
        if (this.coachRun === mine) this.coachRun = null
        this.tryGenerate()
      }),
    )
  }

  private cancelCoach(): void {
    const run = this.coachRun
    this.coachRun = null
    run?.cancel()
  }

  private stopCoaching(): void {
    this.cancelCoach()
    this.clearTimer('coach')
    this.coach.resetEpisode()
  }

  // ── timers and invalidation ────────────────────────────────────────────────────────

  private scheduleTurnTimer(now: number): void {
    const at = this.assembler.nextDeadline()
    if (at === null) {
      this.clearTimer('turn')
      return
    }
    this.setTimer('turn', Math.max(0, at - now), () => {
      const t = this.deps.now()
      this.handleCompleted(this.assembler.tick(t), t)
      this.evaluateCoach(t)
      this.scheduleTurnTimer(t)
    })
  }

  private scheduleCoachTimer(now: number): void {
    const s = this.deps.settings()
    const at = s.coachWhileTalking ? this.coach.nextCheckAt(now) : null
    if (at === null) {
      this.clearTimer('coach')
      return
    }
    this.setTimer('coach', Math.max(0, at - now), () => this.evaluateCoach(this.deps.now()))
  }

  private setTimer(name: TimerName, ms: number, fn: () => void): void {
    this.clearTimer(name)
    const epoch = this.epoch
    this.timers.set(
      name,
      this.deps.setTimer(() => {
        this.timers.delete(name)
        this.guard(() => {
          if (epoch === this.epoch) fn()
        })
      }, ms),
    )
  }

  private clearTimer(name: TimerName): void {
    const handle = this.timers.get(name)
    if (handle === undefined) return
    this.timers.delete(name)
    this.deps.clearTimer(handle)
  }

  /** Discards the unfinished turn and every pending automatic request. */
  private invalidate(): void {
    this.epoch++
    for (const name of this.timers.keys()) this.clearTimer(name)
    for (const c of [this.classifying, this.queued, this.ready]) if (c) this.dropCandidate(c)
    this.cancelCoach()
    this.assembler.reset()
    this.coach.resetEpisode()
  }

  private logFailure(message: string): void {
    const now = this.deps.now()
    if (now - this.lastFailureLogAt < CLASSIFIER_SUSPEND_MS) return
    this.lastFailureLogAt = now
    this.deps.log(message) // never transcript text
  }

  /** Entry points run on socket listeners and timers: an escaping throw ends the process. */
  private guard(fn: () => void): void {
    try {
      fn()
    } catch (e) {
      this.deps.log(`live assistance error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}
