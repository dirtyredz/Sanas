import { observeAssistance } from '../../observation/diagnostics'
import { AnswerCoverage, type AnswerReservation } from '../suggestion/answers/answer-coverage'
import type { QuestionTurn } from '../../../turns/latest-question'
import type { SuggestionHandle, SuggestionRunner } from '../suggestion/suggestion-runner'
import {
  answerNowRequest,
  type AssistSettings,
  type AssistSnapshot,
  type EvidenceHandle,
} from '../suggestion/suggestion-requests'

// "Answer now" / the assist hotkey: bypasses the prefilter and the classifier and takes
// priority over an unpublished next point. It retrieves same-job evidence (when available)
// and starts one hotkey-lane answer; the live-assistance coordinator injects the rest.

export interface AnswerNowHost {
  coverage: AnswerCoverage
  settings(): AssistSettings
  snapshot(): AssistSnapshot | null
  runner: Pick<SuggestionRunner, 'canStart' | 'start'>
  retrieve(meetingId: number, text: string, automatic: boolean): EvidenceHandle | null
  /** The invalidation epoch: a request raised under an older one is dropped. */
  epoch(): number
  /** Runs an entry point so an escaping throw is logged, never fatal. */
  guard(fn: () => void): void
  /** The question the answer anchors on, or null for the rolling window. */
  question(): QuestionTurn | null
  /** An answer is about to be requested: answer assistance outranks a next point. */
  admitted(): void
  /** The answer started: its end is watched for waiting automatic work. */
  started(handle: SuggestionHandle): void
}

export class AnswerNow {
  private reservation: AnswerReservation | null = null
  private pending: EvidenceHandle | null = null

  constructor(private readonly host: AnswerNowHost) {}

  request(): void {
    this.host.guard(() => {
      const host = this.host
      if (this.pending) return
      const snap = host.snapshot()
      if (!snap || snap.window.length === 0) return
      const question = host.question()
      const existing = question && host.coverage.find(snap.meetingId, question)
      if (existing && host.coverage.reuse(existing)) {
        observeAssistance({
          event: 'answer-reused',
          suggestionId: existing.card!.suggestionId,
          reason: 'existing-answer',
        })
        return
      }
      if (!host.runner.canStart('hotkey')) return
      const reservation = question
        ? host.coverage.reserve(snap.meetingId, [question], 'manual', () => this.cancelPending())
        : null
      if (question && !reservation) return
      this.reservation = reservation
      host.admitted()
      const epoch = host.epoch()
      const dispatch = (evidence: string): void =>
        host.guard(() => {
          if (
            (reservation && !host.coverage.owns(reservation)) ||
            epoch !== host.epoch() ||
            host.snapshot()?.meetingId !== snap.meetingId ||
            !host.runner.canStart('hotkey')
          ) {
            if (reservation) host.coverage.release(reservation)
            return
          }
          const handle = host.runner.start(
            answerNowRequest(host.snapshot()!, host.settings(), question, evidence),
            reservation ? host.coverage.lifecycle(reservation) : undefined,
          )
          this.reservation = null
          if (handle) host.started(handle)
          else if (reservation) host.coverage.release(reservation)
        })
      const pending = host.retrieve(
        snap.meetingId,
        question?.text ??
          snap.window
            .slice(-6)
            .map((l) => l.text)
            .join(' '),
        false,
      )
      if (!pending) {
        dispatch('')
        return
      }
      this.pending = pending
      void pending.ready.then((text) => {
        if (this.pending === pending) this.pending = null
        dispatch(text)
      })
    })
  }

  /** An invalidation: a retrieval still in flight is cancelled and its answer never starts. */
  cancelPending(): void {
    if (this.reservation) this.host.coverage.release(this.reservation)
    this.reservation = null
    this.pending?.cancel()
    this.pending = null
  }
}
