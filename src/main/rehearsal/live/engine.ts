import type { LivePlan } from './plan'
import { interviewRequest, type Interviewer, type ConversationFinal } from './interviewer'

export interface LiveTurn {
  id: string
  topicId: string
  followUp: boolean
  text: string
  fallback: boolean
  startedMs: number
  audioStartMs?: number
  spokenMs?: number
  finalMs?: number
  spans: { startMs: number; endMs: number }[]
}
export interface LiveEffects {
  now(): number
  audioNow?(): number
  speak(text: string, signal: AbortSignal): Promise<void>
  share(path: string): Promise<void>
}

/** One serialized interviewer; only finals enter conversation, activity only resets silence. */
export class LiveEngine {
  readonly turns: LiveTurn[] = []
  readonly finals: ConversationFinal[] = []
  state: 'idle' | 'thinking' | 'speaking' | 'waiting' | 'ended' = 'idle'
  endReason?: string
  private index = -1
  private followUps = 0
  private started = 0
  private lastOwnerActivity = 0
  private ownerFinal = false
  private skipPending = false
  private controller?: AbortController
  private task?: Promise<void>
  constructor(
    readonly plan: LivePlan,
    private interviewer: Interviewer,
    private effects: LiveEffects,
  ) {}

  start(): void {
    if (this.state !== 'idle') return
    this.started = this.effects.now()
    this.launch(true)
  }
  activity(): void {
    if (this.state === 'waiting') this.lastOwnerActivity = this.effects.now()
  }
  final(role: 'owner' | 'interviewer', text: string, startMs: number, endMs: number): void {
    if (!text.trim()) return
    this.finals.push({ role, text })
    if (role === 'owner' && this.state === 'waiting') {
      this.ownerFinal = true
      this.activity()
    }
    if (role === 'interviewer') {
      // Late provider finals belong to the speech window in audio time, not the
      // question currently thinking/speaking when that final happens to arrive.
      const turn = [...this.turns]
        .reverse()
        .find((t) => t.audioStartMs === undefined || startMs >= t.audioStartMs)
      if (turn) {
        turn.spans.push({ startMs, endMs })
        turn.finalMs = this.effects.now()
      }
    }
  }
  reset(): void {
    this.ownerFinal = false
    this.activity()
  }
  tick(): void {
    if (this.state === 'idle' || this.state === 'ended') return
    if (this.effects.now() - this.started >= this.plan.durationMs) {
      this.end('duration')
      return
    }
    if (
      this.state === 'waiting' &&
      this.ownerFinal &&
      this.effects.now() - this.lastOwnerActivity >= this.plan.silenceMs
    )
      this.launch(false)
  }
  skip(): void {
    if (this.state === 'ended' || this.state === 'idle') return
    if (this.task) {
      this.skipPending = true
      this.controller?.abort()
    } else this.launch(true)
  }
  end(reason = 'owner'): void {
    this.state = 'ended'
    this.endReason = reason
    this.skipPending = false
    this.controller?.abort()
  }
  async settled(): Promise<void> {
    await this.task
  }
  private launch(forceNext: boolean): void {
    if (this.task || this.state === 'ended') return
    this.ownerFinal = false
    this.task = this.advance(forceNext)
      .catch(() => {
        if (this.state !== 'ended' && !this.skipPending) this.end('output-failed')
      })
      .finally(() => {
        this.task = undefined
        if (this.skipPending && this.state !== 'ended') {
          this.skipPending = false
          this.launch(true)
        }
      })
  }
  private async advance(forceNext: boolean): Promise<void> {
    const controller = (this.controller = new AbortController())
    const request = interviewRequest(this.plan, this.index, this.followUps, this.finals, forceNext)
    if (!request.next && !request.allowFollowUp) {
      this.end('plan-complete')
      return
    }
    this.state = 'thinking'
    let decision,
      fallback = false
    // Bound even stub providers that ignore AbortSignal. Cancellation is not a fallback.
    let timer: ReturnType<typeof setTimeout> | undefined
    let abort: (() => void) | undefined
    const call = new AbortController()
    const cancelCall = (): void => call.abort()
    controller.signal.addEventListener('abort', cancelCall, { once: true })
    try {
      decision = await Promise.race([
        this.interviewer.next(request, call.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            call.abort()
            reject(new Error('Interviewer deadline'))
          }, 12500)
          abort = () => reject(new Error('Cancelled'))
          controller.signal.addEventListener('abort', abort, { once: true })
        }),
      ])
      if (decision.action === 'follow-up' && !request.allowFollowUp)
        throw new Error('Follow-up cap')
    } catch {
      if (controller.signal.aborted) return
      fallback = true
      decision = { action: 'next' as const, text: request.next?.question ?? '' }
    } finally {
      clearTimeout(timer)
      call.abort()
      controller.signal.removeEventListener('abort', cancelCall)
      if (abort) controller.signal.removeEventListener('abort', abort)
    }
    if (controller.signal.aborted) return
    if (decision.action === 'next') {
      if (!request.next) {
        this.end('plan-complete')
        return
      }
      this.index++
      this.followUps = 0
    } else this.followUps++
    const topic = this.plan.topics[this.index]
    if (decision.action === 'next' && topic.screen) await this.effects.share(topic.screen)
    if (controller.signal.aborted) return
    const turn: LiveTurn = {
      id: `turn-${this.turns.length + 1}`,
      topicId: topic.id,
      followUp: decision.action === 'follow-up',
      text: decision.text,
      fallback,
      startedMs: this.effects.now(),
      audioStartMs: this.effects.audioNow?.(),
      spans: [],
    }
    this.turns.push(turn)
    this.state = 'speaking'
    await this.effects.speak(turn.text, controller.signal)
    if (controller.signal.aborted) return
    turn.spokenMs = this.effects.now()
    this.ownerFinal = false
    this.lastOwnerActivity = this.effects.now()
    this.state = 'waiting'
  }
}
