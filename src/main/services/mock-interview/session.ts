import type { MockState, MockResult } from '@shared/mock-interview/types'
import type { MeetingState } from '@shared/types'
import type { MeetingObservation } from '../meetings/observation'
import type { RunObservation } from '../meetings/assist/run-observation'
import type { AssistDiagnostic } from '../meetings/assist/diagnostics'
import { LiveEngine } from './engine'
import { MockEvidence } from './evidence'
import type { Interviewer } from './interviewer'
import type { LivePlan } from './plan'

export interface MockSessionDeps {
  start(jobId: number): Promise<MeetingState>
  stop(): Promise<unknown>
  audioNow(): number
  open(onClose: () => void): Promise<void>
  close(): void
  controls(actions: { skip(): void; end(): void; dismiss(): void }): () => void
  subscribeMeeting(fn: (e: MeetingObservation) => void): () => void
  subscribeRuns(fn: (e: RunObservation) => void): () => void
  subscribeAssistance(fn: (e: AssistDiagnostic) => void): () => void
  share(name: string): string
  publish(state: MockState): void
  save(result: MockResult): void
  now(): number
  observeOwner?(closed: () => void): () => void
}

/** Owns one practice meeting and its output window, never a second capture/provider path. */
export class MockSession {
  private engine: LiveEngine
  private evidence: MockEvidence
  private meetingId: number | null = null
  private phase: 'idle' | 'starting' | 'running' | 'ending' | 'ended' = 'idle'
  private share: string | null = null
  private speech: MockState['speech'] = null
  private speechSeq = 0
  private speechAck?: (ok: boolean) => void
  private cleanups: (() => void)[] = []
  private liveCleanups: (() => void)[] = []
  private timer?: ReturnType<typeof setInterval>
  private ending?: Promise<void>
  private error?: string
  private lastPublished = ''
  private lastSaved = ''
  private stoppedAt = 0
  constructor(
    plan: LivePlan,
    interviewer: Interviewer,
    private deps: MockSessionDeps,
  ) {
    this.evidence = new MockEvidence(deps.now)
    this.engine = new LiveEngine(plan, interviewer, {
      now: deps.now,
      audioNow: deps.audioNow,
      speak: (text, signal) => this.speak(text, signal),
      share: async (name) => {
        this.share = deps.share(name)
        this.publish()
      },
    })
  }
  state(): MockState {
    const status = this.phase === 'running' ? this.engine.state : this.phase
    return {
      meetingId: this.meetingId,
      status,
      persona: this.engine.plan.persona,
      caption: this.engine.turns.at(-1)?.text ?? '',
      share: this.share,
      speech: this.speech,
      result: this.meetingId === null ? null : this.evidence.result(this.engine, this.meetingId),
      ...(this.error ? { error: this.error } : {}),
    }
  }
  async start(jobId: number): Promise<void> {
    if (this.phase !== 'idle') throw new Error('Mock interview already started')
    this.phase = 'starting'
    this.publish()
    try {
      if (this.deps.observeOwner)
        this.liveCleanups.push(
          this.deps.observeOwner(() => {
            void this.end('library-closed')
          }),
        )
      const state = await this.deps.start(jobId)
      if (state.status !== 'live' || state.meetingId === null)
        throw new Error(state.error ?? 'Meeting could not start')
      this.meetingId = state.meetingId
      if (this.phase !== 'starting') {
        await this.deps.stop()
        this.persist()
        this.publish()
        return
      }
      this.liveCleanups.push(this.deps.subscribeMeeting((e) => this.meeting(e)))
      this.cleanups.push(
        this.deps.subscribeRuns((e) => {
          const id = e.kind === 'visible' ? e.event.meetingId : e.meetingId
          if (id === this.meetingId) {
            this.evidence.run(e)
            this.persist()
            this.publish()
          }
        }),
      )
      this.liveCleanups.push(
        this.deps.subscribeAssistance((e) => {
          this.evidence.transitions.push({
            atMs: this.deps.now(),
            event: e.event,
            reason: e.reason,
            span: e.turn ? { startMs: e.turn.startMs, endMs: e.turn.endMs } : undefined,
          })
        }),
      )
      await this.deps.open(() => {
        void this.end('window-closed')
      })
      if (this.phase !== 'starting') {
        this.deps.close()
        return
      }
      this.liveCleanups.push(
        this.deps.controls({
          skip: () => this.skip(),
          end: () => {
            void this.end()
          },
          dismiss: () => this.dismiss(),
        }),
      )
      this.phase = 'running'
      this.engine.start()
      this.timer = setInterval(() => this.tick(), 100)
      this.persist()
      this.publish()
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Mock interview failed to start'
      await this.end('setup-failed')
      throw e
    }
  }
  private meeting(e: MeetingObservation): void {
    if (e.kind === 'state') {
      if (e.value.meetingId !== this.meetingId || e.value.status !== 'live')
        void this.end(e.value.error ? 'capture-failed' : 'meeting-stopped-or-paused')
    } else if (e.kind === 'signal') {
      if (e.value.kind === 'reset') this.engine.reset()
      else if (e.value.kind === 'activity' && e.value.channel === 0) this.engine.activity()
    } else if (e.value.meetingId === this.meetingId) {
      const t = e.value
      if (t.isFinal) {
        // Stereo unknown identity is never treated as the interviewer.
        if (e.role !== 'unknown')
          this.engine.final(
            e.role === 'user' ? 'owner' : 'interviewer',
            t.text,
            t.tStartMs,
            t.tEndMs,
          )
        this.persist()
      } else if (t.isUser) this.engine.activity()
    }
  }
  skip(): void {
    if (this.phase === 'running') this.engine.skip()
  }
  dismiss(): void {
    this.share = null
    this.publish()
  }
  acknowledge(id: number, ok: boolean): void {
    if (id === this.speech?.id) this.speechAck?.(ok)
  }
  private speak(text: string, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const finish = (ok: boolean): void => {
        clearTimeout(timeout)
        signal.removeEventListener('abort', abort)
        this.speechAck = undefined
        this.speech = null
        this.publish()
        if (ok || signal.aborted) resolve()
        else {
          this.error = 'Offline speech playback failed. Check Windows voices and default output.'
          reject(new Error(this.error))
        }
      }
      const abort = (): void => finish(true)
      const timeout = setTimeout(() => finish(false), 90000)
      this.speech = { id: ++this.speechSeq, text }
      this.speechAck = finish
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      else this.publish()
    })
  }
  private tick(): void {
    if (this.phase === 'running') {
      this.engine.tick()
      if (this.engine.state === 'ended') void this.end(this.engine.endReason)
    }
    if (
      this.phase === 'ended' &&
      (!this.evidence.requests.some((r) => r.status === 'pending') ||
        this.deps.now() - this.stoppedAt > 65000)
    )
      this.dispose()
    this.publish()
  }
  end(reason = 'owner'): Promise<void> {
    if (this.ending) return this.ending
    this.phase = 'ending'
    this.engine.end(reason)
    this.publish()
    this.ending = this.finish()
    return this.ending
  }
  private async finish(): Promise<void> {
    try {
      await this.engine.settled()
      if (this.meetingId !== null) await this.deps.stop()
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not stop meeting'
    } finally {
      for (const cleanup of this.liveCleanups.splice(0)) cleanup()
      this.deps.close()
      this.share = null
      this.phase = 'ended'
      this.stoppedAt = this.deps.now()
      this.persist()
      this.publish()
      // Keep result observation alive briefly for answers that finish after Stop.
      if (!this.timer) this.dispose()
    }
  }
  dispose(): void {
    clearInterval(this.timer)
    this.timer = undefined
    for (const cleanup of this.cleanups.splice(0)) cleanup()
    for (const cleanup of this.liveCleanups.splice(0)) cleanup()
    this.persist()
  }
  private persist(): void {
    if (this.meetingId === null) return
    try {
      const result = this.evidence.result(this.engine, this.meetingId)
      const encoded = JSON.stringify(result)
      if (encoded === this.lastSaved) return
      this.deps.save(result)
      this.lastSaved = encoded
    } catch {
      this.error = 'Practice results could not be saved. Check free disk space.'
    }
  }
  private publish(): void {
    const state = this.state(),
      encoded = JSON.stringify(state)
    if (encoded !== this.lastPublished) {
      this.lastPublished = encoded
      this.deps.publish(state)
    }
  }
}
