import {
  observeAssistance,
  type AssistDiagnostic,
  type InvalidationReason,
} from '../../observation/diagnostics'
import { formatVerdict, isAcceptedVerdict } from '../../../assistant/classifier/classifier-verdict'
import { TurnAssembler } from '../../../turns/turn-assembler'
import {
  ANSWER_NOW_QUESTION_MS,
  couldBeQuestion,
  latestQuestion,
} from '../../../turns/latest-question'
import type { CompletedTurn, IdentityRole, TurnFinal } from '../../../turns/types'
import { answerCooldownAllows, looksLikeResponseCandidate } from '../../../assistant/triggers'
import type {
  ClassifierOutcome,
  ClassifierTurn,
  ClassifyRequest,
  Addressee,
  ResponseKind,
} from '../../../assistant/classifier/classifier'
import { QuestionLedger } from './question-ledger'
import { speakerLabel } from '../../../turns/transcript-format'
import type { SuggestionHandle, SuggestionRunner } from '../suggestion/suggestion-runner'
import { SpeculativeAnswer } from './speculative-answer'
import { ClassifierBreaker } from './breaker/classifier-breaker'
import { AnswerCoverage, type AnswerReservation } from '../suggestion/answers/answer-coverage'
import { AnswerNow } from '../manual/answer-now'
import { CoachCoordinator } from '../coach/coach-coordinator'
import {
  assistReady,
  automaticAnswerRequest,
  providerCredentials,
  type AssistSettings,
  type AssistSnapshot,
  type EvidenceHandle,
} from '../suggestion/suggestion-requests'

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
//
// When the classifier starts on a free ambient lane, the neutral automatic answer starts with
// it, unpublished (./speculative-answer.ts), so classifier latency overlaps the answer's time
// to first text for every accepted verdict (question, request or objection; Me or the room).
// The verdict promotes it when the ordinary request would be the same prompt, or it is
// discarded silently and the ordinary path runs. Every way a candidate ends (drop, verdict,
// expiry, invalidation) discards it.
//
// Decisions are observed with a monotonic stamp from `now` (./latency.ts reads them).

export const CANDIDATE_LIFETIME_MS = 6_000
export const CLASSIFIER_SPACING_MS = 1_000
/** New speech must pass the candidate's end by this much to count as "after" it. */
const AFTER_TOLERANCE_MS = 250
/** A user final this short ("yeah", "good question") is not the user answering yet. */
const USER_RESPONSE_MIN_WORDS = 3
const RECENT_TURNS = 3

const TURN_DOWN_CATEGORY = {
  expired: 'expired',
  suspended: 'policy',
  'no-key': 'policy',
  cooldown: 'policy',
  'addressee-or-cooldown': 'policy',
  'no-meeting': 'invalidated',
} as const

export interface LiveAssistanceDeps {
  /** Monotonic receipt time, ms. */
  now(): number
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  settings(): AssistSettings
  classify(req: ClassifyRequest): Promise<ClassifierOutcome>
  runner: Pick<SuggestionRunner, 'canStart' | 'start' | 'speculate'>
  /** The live meeting right now, or null when there is none. */
  snapshot(): AssistSnapshot | null
  retrieve?(
    meetingId: number,
    text: string,
    automatic: boolean,
    signal?: AbortSignal,
    correlation?: number,
  ): EvidenceHandle | null
  coverage?: AnswerCoverage
  availabilityChanged?(): void
  log(message: string): void
}

interface Candidate {
  turn: CompletedTurn
  previous: CompletedTurn[]
  kind?: ResponseKind
  addressee?: Addressee
  abort?: AbortController
  /** The classifier attempt for this candidate (evidence correlation). */
  attempt?: number
  evidence?: string
  retrieval?: EvidenceHandle
  retrievalPending?: boolean
  reservation?: AnswerReservation
  asked?: CompletedTurn[]
  dropped: boolean
}

type TimerName = 'turn' | 'coach' | 'admit'

function words(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

export class LiveAssistance {
  private readonly coverage: AnswerCoverage
  private answerEveryQuestion = false
  setAnswerEveryQuestion(on: boolean): void {
    this.answerEveryQuestion = on
  }

  answerEveryQuestionEnabled(): boolean {
    return this.answerEveryQuestion
  }
  manualAdmitted(): void {
    this.coach.cancel()
  }
  private active = false
  private identityNeedsConfirmation = false

  setIdentityNeedsConfirmation(required: boolean): void {
    this.identityNeedsConfirmation = required
    this.identityChanged()
  }
  private epoch = 0
  private assembler = new TurnAssembler()
  private recentTurns: CompletedTurn[] = []
  /** The latest substantial other-speaker turn: what Answer now and next points anchor on. */
  private lastQuestion: CompletedTurn | null = null
  /** Admitted questions no suggestion has covered yet: stacked ones are answered together. */
  private unanswered = new QuestionLedger()
  private classifying: Candidate | null = null
  private queued: Candidate | null = null
  private ready: Candidate | null = null
  private lastClassifierStartAt: number | null = null
  private breaker: ClassifierBreaker
  automaticUnavailable(): boolean {
    return this.active && this.breaker.suspended()
  }
  private lastAnswerAt: number | null = null
  private timers = new Map<TimerName, unknown>()
  private classifierAttempts = 0

  private speculation: SpeculativeAnswer
  private coach: CoachCoordinator
  private answerNowRequests: AnswerNow

  constructor(private deps: LiveAssistanceDeps) {
    this.coverage = deps.coverage ?? new AnswerCoverage(deps.now)
    this.speculation = new SpeculativeAnswer(deps.runner)
    this.breaker = new ClassifierBreaker(deps)
    const guard = (fn: () => void): void => this.guard(fn)
    this.coach = new CoachCoordinator({
      now: () => deps.now(),
      settings: () => deps.settings(),
      snapshot: () => deps.snapshot(),
      runner: deps.runner,
      active: () => this.active && !this.identityNeedsConfirmation,
      epoch: () => this.epoch,
      guard,
      candidatePending: () => this.candidatePending(),
      lastQuestion: () => this.lastQuestion,
      schedule: (ms, fn) => this.setTimer('coach', ms, fn),
      unschedule: () => this.clearTimer('coach'),
      runEnded: () => this.tryGenerate(),
    })
    this.answerNowRequests = new AnswerNow({
      coverage: this.coverage,
      settings: () => deps.settings(),
      snapshot: () => deps.snapshot(),
      runner: deps.runner,
      retrieve: (meetingId, text, automatic) => deps.retrieve?.(meetingId, text, automatic) ?? null,
      epoch: () => this.epoch,
      guard,
      question: () =>
        latestQuestion(
          this.lastQuestion,
          this.assembler.openTurns(),
          deps.now(),
          ANSWER_NOW_QUESTION_MS,
        ),
      admitted: () => this.coach.cancel(),
      started: (handle) => {
        this.afterRun(handle)
      },
    })
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────────────

  /** A meeting started or resumed: transient state and cooldowns start over. */
  start(): void {
    this.guard(() => {
      this.invalidate('start')
      this.active = true
      this.coach.reset()
      this.recentTurns = []
      this.lastQuestion = null
      this.lastAnswerAt = null
      this.lastClassifierStartAt = null
      this.breaker.reset()
    })
  }

  /** Pause or stop. Called BEFORE the socket shutdown is awaited, so nothing generates
   *  from speech the meeting is leaving behind. An answer already started still finishes. */
  halt(): void {
    this.guard(() => {
      this.active = false
      this.breaker.reset()
      this.invalidate('stop-or-pause')
      const c = this.speculation.takeCounts()
      if (c) {
        // spend visibility; no text
        this.deps.log(
          `speculative answers: started=${c.started} promoted=${c.promoted} discarded=${c.discarded}`,
        )
      }
    })
  }

  /** The provider lost connection continuity: whatever was half-assembled is incomplete. */
  connectionReset(): void {
    this.guard(() => this.invalidate('connection-reset'))
  }

  /** "That's me" changed: identities in flight are no longer trustworthy. Old turns are
   *  not re-triggered. */
  identityChanged(): void {
    this.guard(() => {
      this.invalidate('identity-change')
      this.lastQuestion = null
    })
  }

  /** Assistance settings were saved. Disabling coaching cancels it at once. */
  settingsChanged(): void {
    this.guard(() => this.coach.settingsChanged())
  }

  // ── transcript evidence ────────────────────────────────────────────────────────────

  final(f: TurnFinal): void {
    this.guard(() => {
      if (!this.active || this.identityNeedsConfirmation) return
      const now = this.deps.now()
      const { accepted, completed } = this.assembler.final(f, now)
      this.handleCompleted(completed, now)
      if (accepted) {
        this.dropOvertakenCandidates(f)
        if (f.role === 'user') {
          this.coach.userFinal(f, now)
        } else this.coach.otherFinal()
        this.coach.evaluate(now)
      }
      this.scheduleTurnTimer(now)
    })
  }

  /** Speech activity (an interim or VAD event). `role` is the channel's identity in stereo
   *  and 'unknown' in mono, where activity says nothing about who is speaking. */
  activity(channel: number, atMs: number, role: IdentityRole): void {
    this.guard(() => {
      if (!this.active || this.identityNeedsConfirmation) return
      const now = this.deps.now()
      this.assembler.activity(channel, atMs, now)
      this.scheduleTurnTimer(now)
      this.coach.activity(role, atMs, now)
    })
  }

  boundary(channel: number, atMs: number, source: 'endpoint' | 'utterance-end'): void {
    this.guard(() => {
      if (!this.active || this.identityNeedsConfirmation) return
      const now = this.deps.now()
      this.assembler.boundary(channel, atMs, source, now)
      this.scheduleTurnTimer(now)
    })
  }

  // ── requested answers ──────────────────────────────────────────────────────────────

  /** "Answer now" / the assist hotkey: bypasses the prefilter and the classifier, and
   *  takes priority over an unpublished next point. */
  answerNow(): void {
    this.answerNowRequests.request()
  }

  // ── turns → candidates → classifier → answer ──────────────────────────────────────

  private handleCompleted(turns: CompletedTurn[], now: number): void {
    for (const turn of turns) {
      this.observe({ event: 'turn-completed', turn })
      const previous = this.recentTurns.slice(-2)
      this.recentTurns = [...this.recentTurns, turn].slice(-RECENT_TURNS)
      if (couldBeQuestion(turn)) this.lastQuestion = turn
      if (turn.role === 'user') {
        this.coach.userTurnCompleted(turn.startMs, now)
        continue
      }
      if (looksLikeResponseCandidate(turn.text)) this.admit({ turn, previous, dropped: false })
      else
        this.observe({
          event: 'not-classified',
          turn,
          reason: 'prefilter',
          turnedDown: 'prefilter',
        })
    }
  }

  private admit(c: Candidate): void {
    this.coach.cancel() // answer assistance has priority
    for (const old of [this.ready, this.queued])
      if (old) this.observe({ event: 'superseded', turn: old.turn, turnedDown: 'superseded' })
    this.ready = null // a newer completed turn supersedes one still waiting for the lane
    this.queued = c // the newest only: never a queue — it carries the overtaken questions
    this.unanswered.record(c.turn, this.deps.now())
    this.tryClassify()
  }

  /** New finalized speech after a pending candidate means the moment has moved on: the
   *  original speaker resumed, someone else took over, or the user started answering. */
  private dropOvertakenCandidates(f: TurnFinal): void {
    for (const c of [this.classifying, this.queued, this.ready]) {
      if (!c || c.dropped) continue
      if (f.tEndMs <= c.turn.endMs + AFTER_TOLERANCE_MS) continue // the candidate's own late words
      if (f.role === 'user' && words(f.text) < USER_RESPONSE_MIN_WORDS) continue
      this.dropCandidate(c, f.role === 'user' ? 'user-final' : 'new-final')
    }
    // the user is answering: what was asked before is no longer waiting for a suggestion
    if (f.role === 'user' && words(f.text) >= USER_RESPONSE_MIN_WORDS) {
      this.observe({ event: 'ledger-cleared', reason: 'user-final' })
      this.unanswered.clear()
    }
  }

  private dropCandidate(
    c: Candidate,
    reason: 'new-final' | 'user-final' | 'answer-now' | InvalidationReason,
  ): void {
    this.observe({
      event: 'invalidated',
      turn: c.turn,
      reason,
      turnedDown: reason === 'answer-now' ? 'duplicate' : 'invalidated',
    })
    c.dropped = true
    if (c.reservation) this.coverage.releaseUnpublished(c.reservation)
    c.abort?.abort()
    c.retrieval?.cancel()
    this.speculation.discard(c.turn, reason)
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
      this.breaker.suspended() ||
      !assistReady(s) ||
      !answerCooldownAllows(this.lastAnswerAt, now, s.nudgeCooldownSec)
    ) {
      const reason = this.expired(c, now)
        ? 'expired'
        : this.breaker.suspended()
          ? 'suspended'
          : !assistReady(s)
            ? 'no-key'
            : 'cooldown'
      this.observe({
        event: 'not-classified',
        turn: c.turn,
        turnedDown: TURN_DOWN_CATEGORY[reason],
        reason,
      })
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
      this.observe({
        event: 'not-classified',
        turn: c.turn,
        reason: 'no-meeting',
        turnedDown: TURN_DOWN_CATEGORY['no-meeting'],
      })
      this.queued = null
      return
    }
    const asked = this.unanswered.select(now).filter((t) => !this.coverage.find(snap.meetingId, t))
    if (!asked.some((t) => t.id === c.turn.id)) {
      this.observe({
        event: 'not-classified',
        turn: c.turn,
        reason: 'covered',
        turnedDown: 'duplicate',
      })
      this.queued = null
      return
    }
    c.asked = asked
    c.reservation =
      this.coverage.reserve(snap.meetingId, asked, 'automatic', () =>
        this.dropCandidate(c, 'answer-now'),
      ) ?? undefined
    if (!c.reservation) return
    this.queued = null
    this.classifying = c
    this.lastClassifierStartAt = now
    c.abort = new AbortController()
    const label = (t: CompletedTurn): ClassifierTurn => ({
      speaker: speakerLabel({ speaker: t.speaker, isUser: t.role === 'user' }, snap.names),
      text: t.text,
    })
    const epoch = this.epoch
    const attempt = (c.attempt = ++this.classifierAttempts)
    this.observe({ event: 'classifier-started', turn: c.turn, attempt })
    c.retrieval =
      this.deps.retrieve?.(snap.meetingId, c.turn.text, true, c.abort.signal, c.turn.id) ??
      undefined
    c.retrievalPending = !!c.retrieval
    if (c.retrieval)
      void c.retrieval.ready.then((text) =>
        this.guard(() => {
          c.retrievalPending = false
          c.evidence = text
          if (epoch !== this.epoch || c.dropped) return
          if (this.classifying === c) this.speculate(c, snap, s, this.deps.now())
          if (this.ready === c) this.tryGenerate()
        }),
      )
    else this.speculate(c, snap, s, now)
    void this.deps
      .classify({
        diagnosticTurn: c.turn,
        ...providerCredentials(s),
        model: s.classifierModel,
        current: label(c.turn),
        previous: c.previous.map(label),
        signal: c.abort.signal,
        onUsage: (usage) =>
          this.observe({ event: 'classifier-usage', turn: c.turn, attempt, usage }),
      })
      .catch((): ClassifierOutcome => ({ status: 'failed', reason: 'provider' }))
      .then((outcome) => this.guard(() => this.onClassified(c, epoch, outcome)))
  }

  /** Starts the neutral automatic answer alongside the classifier when the ambient lane is free.
   *  Expiry, suspension, key and cooldown checks have already passed; nothing here consumes
   *  the cooldown or the ledger — only a promotion does. */
  private speculate(c: Candidate, snap: AssistSnapshot, s: AssistSettings, _now: number): void {
    if (!this.deps.runner.canStart('ambient')) return
    const asked = c.asked ?? []
    if (!c.reservation || !this.coverage.owns(c.reservation)) return
    const handle = this.speculation.begin(
      c.turn,
      automaticAnswerRequest(snap, s, c.turn, asked, 'automatic', c.evidence),
      this.coverage.lifecycle(c.reservation, () => this.unanswered.cover(asked)),
    )
    if (handle) this.afterRun(handle) // when it ends, a waiting candidate or next point may go
  }

  private onClassified(c: Candidate, epoch: number, outcome: ClassifierOutcome): void {
    const verdict = outcome.status === 'failed' ? outcome.reason : formatVerdict(outcome)
    // the coordinator's own decision, taken before it is reported: `accepted` means this
    // verdict will go on to be answered, not merely that it named something to answer
    const live = epoch === this.epoch && !c.dropped
    const named = outcome.status === 'classified' && isAcceptedVerdict(outcome)
    const willAnswer = live && named && (outcome.addressee !== 'other' || this.answerEveryQuestion)
    this.observe({
      event: 'classified',
      turn: c.turn,
      reason: verdict,
      accepted: willAnswer,
      turnedDown: live && named && !willAnswer ? 'policy' : undefined,
      attempt: c.attempt,
      shape: outcome.status === 'failed' ? outcome.shape : undefined,
    })
    if (this.classifying === c) this.classifying = null
    let accepted = false
    if (live) {
      if (outcome.status === 'classified') this.breaker.recordSuccess()
      if (outcome.status === 'failed') {
        this.breaker.recordFailure(outcome.reason, outcome.diagnostic)
      } else if (willAnswer) {
        // put to someone else: not Me's to answer. Me or the room: the prompt says which.
        c.kind = outcome.kind
        c.addressee = outcome.addressee
        this.ready = c
        accepted = true
      }
    }
    // a rejected, failed or stale verdict ends the speculation silently; an accepted one
    // promotes or discards it in tryGenerate
    if (accepted) this.tryGenerate()
    else {
      c.dropped = true
      if (c.reservation) this.coverage.releaseUnpublished(c.reservation)
      c.retrieval?.cancel()
      this.speculation.discard(c.turn, `verdict ${verdict}`)
    }
    this.tryClassify()
    if (this.active) this.coach.evaluate(this.deps.now())
  }

  private tryGenerate(): void {
    const c = this.ready
    if (!c || !c.kind || !c.addressee || c.retrievalPending) return
    const now = this.deps.now()
    const s = this.deps.settings()
    if (
      (c.addressee === 'other' && !this.answerEveryQuestion) ||
      this.expired(c, now) ||
      !answerCooldownAllows(this.lastAnswerAt, now, s.nudgeCooldownSec)
    ) {
      const reason = this.expired(c, now) ? 'expired' : 'addressee-or-cooldown'
      this.observe({
        event: 'not-generated',
        turn: c.turn,
        reason,
        turnedDown: TURN_DOWN_CATEGORY[reason],
      })
      this.ready = null
      if (c.reservation) this.coverage.releaseUnpublished(c.reservation)
      this.speculation.discard(c.turn, 'not-generated')
      return
    }
    const snap = this.deps.snapshot()
    const asked = c.asked ?? []
    if (snap && (!c.reservation || !this.coverage.owns(c.reservation))) {
      c.reservation =
        this.coverage.reserve(snap.meetingId, asked, 'automatic', () =>
          this.dropCandidate(c, 'answer-now'),
        ) ?? undefined
      if (!c.reservation) {
        this.dropCandidate(c, 'answer-now')
        return
      }
    }
    // the same neutral prompt the speculation used, except a reference answer for a turn put
    // to another participant (Answer every question), which is never published from one
    const request =
      snap &&
      automaticAnswerRequest(
        snap,
        s,
        c.turn,
        asked,
        c.addressee === 'other' ? 'reference' : 'automatic',
        c.evidence,
      )
    // a speculation is published only when it is exactly this request; otherwise it is
    // discarded (freeing the lane) and this request starts in its place
    const admission = this.speculation.admit(c.turn, request || null)
    if (admission.lane === 'busy') {
      this.observe({ event: 'waiting', turn: c.turn, reason: 'busy-lane' })
      return // retried when the lane frees
    }
    this.ready = null
    if (!request) {
      if (c.reservation) this.coverage.release(c.reservation)
      this.observe({
        event: 'not-generated',
        turn: c.turn,
        reason: 'no-meeting',
        turnedDown: TURN_DOWN_CATEGORY['no-meeting'],
      })
      return
    }
    const promoted = admission.lane === 'promoted'
    const handle =
      admission.lane === 'promoted'
        ? admission.handle
        : this.deps.runner.start(
            request,
            c.reservation
              ? this.coverage.lifecycle(c.reservation, () => this.unanswered.cover(asked))
              : undefined,
          )
    if (!handle) {
      if (c.reservation) this.coverage.release(c.reservation)
      return
    }
    if (c.reservation) this.coverage.attachRunCancel(c.reservation, () => handle.cancel())
    this.observe({
      event: 'answer-started',
      turn: c.turn,
      suggestionId: handle.id,
      reason: promoted ? 'speculative' : 'ordinary',
    })
    // consumed when an answer starts — and kept even if it declines with the no-op, so a
    // model with nothing new to say cannot be asked again and again
    this.lastAnswerAt = now
    if (!promoted) this.afterRun(handle) // a speculation's was attached when it began
  }

  /** When any run ends its lane frees: a waiting candidate or a next point may go next. */
  private afterRun(handle: SuggestionHandle): void {
    void handle.done.finally(() =>
      this.guard(() => {
        this.tryGenerate()
        if (this.active) this.coach.evaluate(this.deps.now())
      }),
    )
  }

  /** Meeting context changed (or a new meeting began): a buffered next point built on the old
   *  context is cancelled and coaching restarts from `atMs`. Started answers are untouched. */
  contextChanged(atMs: number): void {
    this.coach.contextChanged(atMs)
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
      this.coach.evaluate(t)
      this.scheduleTurnTimer(t)
    })
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
  private invalidate(reason: InvalidationReason): void {
    this.observe({ event: 'invalidate', reason })
    this.epoch++
    this.answerNowRequests.cancelPending()
    for (const name of this.timers.keys()) this.clearTimer(name)
    for (const c of [this.classifying, this.queued, this.ready])
      if (c) this.dropCandidate(c, reason)
    this.speculation.discard(null, reason) // already gone with its candidate; never leaked
    this.unanswered.clear()
    this.assembler.reset()
    this.coach.invalidated()
  }

  /** Observation with a source stamp; never a decision. */
  private observe(e: AssistDiagnostic): void {
    observeAssistance({ ...e, at: this.deps.now() })
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
