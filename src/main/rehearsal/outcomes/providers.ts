import { AsyncLocalStorage } from 'node:async_hooks'
import type { AssistantProvider, AssistRequest } from '../../services/assistant/types'
import { CLASSIFIER_SYSTEM, parseClassification } from '../../services/assistant/classifier'
import type {
  SttProvider,
  SttSession,
  SttSessionOptions,
  SttBatchTranscript,
} from '../../services/stt/types'
import type { Step } from '../scenario/scenario'
import { beginOutcome, turnSteps, type RequestOutcome } from './outcomes'
import { isNoSuggestion } from '../../services/assistant/compact-contract'
import { ENDPOINTING_MS } from '../../services/stt/endpointing'

type Utterance = Extract<Step, { kind: 'utterance' }>

/** Driven by the harness clock; no independent timers can leak beyond Stop.
 *
 *  Like Deepgram, it reports an endpoint only after ENDPOINTING_MS of silence: when the
 *  scenario resumes speech on the same channel sooner, the final carries no boundary, so a
 *  scripted burst assembles into one turn as live speech would, whatever the turn grace. The
 *  final itself still arrives at utterance end (no endpointing latency is modelled). */
export class ScriptedSttProvider implements SttProvider {
  constructor(private readonly steps: Step[] = []) {}
  private opts: SttSessionOptions | null = null
  private finals: SttBatchTranscript[] = []
  private pending: Utterance[] = []
  private disconnectedUntil = -1
  batchCalls = 0
  reconnects = 0
  async start(opts: SttSessionOptions): Promise<SttSession> {
    this.opts = opts
    return {
      sendAudio: () => {},
      stop: async () => {
        this.opts = null
        this.pending = []
      },
    }
  }
  utterance(step: Utterance): void {
    if (!this.opts || step.atMs < this.disconnectedUntil) return
    this.opts.onTranscript({
      ...this.line(step),
      tEndMs: step.atMs,
      isFinal: false,
      text: `[interim:${step.id}] ${step.text.slice(0, 20)}`,
    })
    this.pending.push(step)
  }
  private line(step: Utterance): SttBatchTranscript {
    return {
      channel: step.channel === 'me' ? 0 : 1,
      speaker: step.speaker,
      text: step.text,
      tStartMs: step.atMs,
      tEndMs: step.atMs + step.durationMs,
    }
  }
  tick(now: number): void {
    if (!this.opts) return
    if (this.disconnectedUntil >= 0 && now >= this.disconnectedUntil) {
      this.disconnectedUntil = -1
      this.reconnects++
    }
    const ready = this.pending.filter((s) => s.atMs + s.durationMs <= now)
    this.pending = this.pending.filter((s) => s.atMs + s.durationMs > now)
    // A long utterance is ongoing speech, not silence between its initial interim and
    // final. Advance VAD through the same signal seam as streaming STT; never future-date it.
    for (const step of this.pending)
      this.opts.onSignal?.({ kind: 'activity', channel: step.channel === 'me' ? 0 : 1, atMs: now })
    for (const step of ready) {
      const line = this.line(step)
      this.finals.push(line)
      this.opts.onTranscript({ ...line, isFinal: true })
      if (this.resumesBeforeEndpoint(step)) continue
      this.opts.onSignal?.({
        kind: 'boundary',
        channel: line.channel,
        atMs: line.tEndMs,
        source: 'endpoint',
      })
    }
  }
  private resumesBeforeEndpoint(step: Utterance): boolean {
    const end = step.atMs + step.durationMs
    return this.steps.some(
      (s) =>
        s.kind === 'utterance' &&
        s !== step &&
        s.id !== step.id &&
        s.channel === step.channel &&
        s.atMs > step.atMs &&
        s.atMs < end + ENDPOINTING_MS,
    )
  }
  drop(now: number, durationMs: number): void {
    this.pending = []
    this.disconnectedUntil = now + durationMs
    this.opts?.onSignal?.({ kind: 'reset' })
  }
  async transcribeFile(): Promise<SttBatchTranscript[]> {
    this.batchCalls++
    return [...this.finals]
  }
}

/** The question(s) an automatic request asked to answer, echoed so expectations can assert
 *  on what the request actually covered (a stacked request lists several, oldest first). */
function coveredLine(req: AssistRequest, steps: Step[]): string {
  const texts = (req.diagnostic?.turns ?? [])
    .map((turn) => {
      const ids = turnSteps(steps, [turn])
      return steps
        .filter(
          (s): s is Extract<Step, { kind: 'utterance' }> =>
            s.kind === 'utterance' && ids.includes(s.id),
        )
        .map((s) => s.text)
        .join(' ')
    })
    .filter(Boolean)
  return texts.length ? '\nCovers: ' + texts.join(' / ') : ''
}

/** Canned responses are derived from actual requests, never from expectations. */
export class RehearsalAssistant implements AssistantProvider {
  slowUntil = 0
  failUntil = 0
  readonly requests: RequestOutcome[] = []
  /** Outgoing userContent by request id, for the meeting-context delivery checks. */
  readonly contents = new Map<number, string>()
  private readonly action = new AsyncLocalStorage<string>()
  withAction<T>(id: string, work: () => T): T {
    return this.action.run(id, work)
  }
  constructor(
    private readonly now: () => number,
    private readonly real?: AssistantProvider,
    private readonly steps: Step[] = [],
  ) {}
  async complete(req: AssistRequest): Promise<string> {
    const record = beginOutcome(
      this.requests.length + 1,
      req,
      this.now(),
      this.steps,
      req.diagnostic?.manualKind ? this.action.getStore() : undefined,
    )
    this.requests.push(record)
    this.contents.set(record.id, req.userContent)
    const originalDelta = req.onDelta
    req = {
      ...req,
      onDelta: originalDelta
        ? (text) => {
            record.firstDeltaMs ??= this.now()
            originalDelta(text)
          }
        : undefined,
    }
    try {
      const delay = Math.max(0, this.slowUntil - this.now())
      if (delay)
        await new Promise<void>((resolve, reject) => {
          const aborted = (): void => {
            clearTimeout(timer)
            reject(new Error('Rehearsal request cancelled'))
          }
          const timer = setTimeout(() => {
            req.signal?.removeEventListener('abort', aborted)
            resolve()
          }, delay)
          if (req.signal?.aborted) aborted()
          else req.signal?.addEventListener('abort', aborted, { once: true })
        })
      if (this.now() < this.failUntil) throw new Error('Injected assistant failure')
      let answer: string
      if (this.real) answer = await this.real.complete(req)
      else {
        answer =
          req.system === CLASSIFIER_SYSTEM
            ? 'question me'
            : req.userContent.includes('The meeting just ended.')
              ? `SUMMARY\n${req.userContent.split('Write exactly')[0]}\nACTION ITEMS\n- Confirm the client follow-up.`
              : req.image
                ? '**The captured dashboard shows the client delivery status.**\nReview the visible milestones with the client.'
                : `**Confirm the delivery milestone and next owner.**\nUse the client context to agree the next action.${coveredLine(req, this.steps)}`
        req.onDelta?.(answer)
      }
      record.answer = answer
      record.completedMs = this.now()
      record.status = isNoSuggestion(answer) ? 'declined' : 'completed'
      if (req.system === CLASSIFIER_SYSTEM)
        record.classifier = parseClassification(answer) ? answer.trim() : 'malformed'
      return answer
    } catch {
      record.completedMs = this.now()
      record.status = req.signal?.aborted ? 'cancelled' : 'failed'
      throw new Error(
        record.status === 'cancelled' ? 'Rehearsal request cancelled' : 'Assistant request failed',
      )
    }
  }
}
