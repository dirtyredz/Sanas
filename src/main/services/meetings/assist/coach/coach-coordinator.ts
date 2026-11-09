import { CoachPolicy } from '../../../assistant/coach/coach-policy'
import { COACH_QUESTION_MS, latestQuestion } from '../../../turns/latest-question'
import type { CompletedTurn, IdentityRole, TurnFinal } from '../../../turns/types'
import type { SuggestionHandle, SuggestionRunner } from '../suggestion/suggestion-runner'
import {
  assistReady,
  coachRequest,
  type AssistSettings,
  type AssistSnapshot,
} from '../suggestion/suggestion-requests'

// Next-point coaching while the user talks: feeds the user's speech to the coach policy
// (../../../assistant/coach), owns its one timer and the buffered next-point run. It yields to
// every answer (a pending candidate, a requested answer) and never decides anything about
// them; the live-assistance coordinator injects what it needs through CoachHost.

export interface CoachHost {
  now(): number
  settings(): AssistSettings
  snapshot(): AssistSnapshot | null
  runner: Pick<SuggestionRunner, 'canStart' | 'start'>
  /** The meeting is live (started and not halted). */
  active(): boolean
  /** The invalidation epoch: work started under an older one is dropped. */
  epoch(): number
  /** Runs an entry point so an escaping throw is logged, never fatal. */
  guard(fn: () => void): void
  /** An automatic answer candidate is queued, classifying or waiting: next points yield. */
  candidatePending(): boolean
  /** The latest substantial other-speaker turn the next point anchors on. */
  lastQuestion(): CompletedTurn | null
  /** Replaces the coach timer; the host drops it on any invalidation. */
  schedule(ms: number, fn: () => void): void
  unschedule(): void
  /** A next point ended: a candidate waiting for the lane may go next. */
  runEnded(): void
}

export class CoachCoordinator {
  private readonly policy = new CoachPolicy()
  private boundary = 0
  private run: SuggestionHandle | null = null

  constructor(private readonly host: CoachHost) {}

  /** A meeting started or resumed: cooldowns start over. */
  reset(): void {
    this.policy.reset()
  }

  /** The user spoke a final (the policy ignores speech before the last context change). */
  userFinal(f: TurnFinal, now: number): void {
    if (f.tStartMs >= this.boundary) this.policy.userFinal(f, now)
  }

  /** Another voice took the floor, or we cannot tell. */
  otherFinal(): void {
    this.policy.endEpisode()
    this.cancel()
  }

  userTurnCompleted(startMs: number, now: number): void {
    if (startMs >= this.boundary) this.policy.userTurnCompleted(now)
  }

  /** Speech activity: `role` is the channel's identity in stereo and 'unknown' in mono. */
  activity(role: IdentityRole, atMs: number, now: number): void {
    if (role === 'user' && atMs >= this.boundary) this.policy.userActivity(now)
    else if (role === 'other') this.cancel()
    else this.policy.ambiguousActivity(now)
    this.scheduleTimer(now)
  }

  /** Assistance settings were saved. Disabling coaching cancels it at once. */
  settingsChanged(): void {
    if (!this.host.settings().coachWhileTalking) this.stop()
    else if (this.host.active()) this.evaluate(this.host.now())
  }

  /** Meeting context changed (or a new meeting began): a buffered next point built on the old
   *  context is cancelled and coaching restarts from `atMs`. Started answers are untouched. */
  contextChanged(atMs: number): void {
    this.cancel()
    this.host.unschedule()
    this.policy.reset()
    this.boundary = atMs
  }

  /** An invalidation: the episode in progress is over (the host clears the timer). */
  invalidated(): void {
    this.cancel()
    this.policy.resetEpisode()
  }

  cancel(): void {
    const run = this.run
    this.run = null
    run?.cancel()
  }

  evaluate(now: number): void {
    const s = this.host.settings()
    if (!this.host.active() || !s.coachWhileTalking) {
      this.host.unschedule()
      return
    }
    this.scheduleTimer(now)
    if (this.run || this.host.candidatePending()) return
    const runner = this.host.runner
    if (!runner.canStart('hotkey') || !runner.canStart('ambient')) return
    if (!assistReady(s)) return
    const reason = this.policy.decide(now, true)
    if (!reason) return
    const snap = this.host.snapshot()
    if (!snap) return
    this.policy.attempted(now) // the cooldown runs from dispatch, failures included
    const epoch = this.host.epoch()
    let handle: SuggestionHandle | null = null
    // the runner has already discarded the no-op; this is the "still current?" check
    const accept = (): boolean => {
      if (epoch !== this.host.epoch() || this.run !== handle || this.host.candidatePending())
        return false
      const current = this.host.snapshot()
      return !!current && current.contextRevision === snap.contextRevision
    }
    handle = runner.start(
      coachRequest(
        snap,
        s,
        {
          excerpt: this.policy.excerpt(),
          reason,
          question: latestQuestion(this.host.lastQuestion(), [], now, COACH_QUESTION_MS),
        },
        accept,
      ),
    )
    if (!handle) return
    const mine = handle
    this.run = mine
    void mine.done.then(() =>
      this.host.guard(() => {
        if (this.run === mine) this.run = null
        this.host.runEnded()
      }),
    )
  }

  private stop(): void {
    this.cancel()
    this.host.unschedule()
    this.policy.resetEpisode()
  }

  private scheduleTimer(now: number): void {
    const s = this.host.settings()
    const at = s.coachWhileTalking ? this.policy.nextCheckAt(now) : null
    if (at === null) {
      this.host.unschedule()
      return
    }
    this.host.schedule(Math.max(0, at - now), () => this.evaluate(this.host.now()))
  }
}
