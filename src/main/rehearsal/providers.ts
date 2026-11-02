import type { AssistantProvider, AssistRequest } from '../services/assistant/types'
import { CLASSIFIER_SYSTEM } from '../services/assistant/classifier'
import type {
  SttProvider,
  SttSession,
  SttSessionOptions,
  SttBatchTranscript,
} from '../services/stt/types'
import type { Step } from './scenario'

/** Driven by the harness clock; no independent timers can leak beyond Stop. */
export class ScriptedSttProvider implements SttProvider {
  private opts: SttSessionOptions | null = null
  private finals: SttBatchTranscript[] = []
  private pending: Extract<Step, { kind: 'utterance' }>[] = []
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
  utterance(step: Extract<Step, { kind: 'utterance' }>): void {
    if (!this.opts || step.atMs < this.disconnectedUntil) return
    this.opts.onTranscript({
      ...this.line(step),
      isFinal: false,
      text: `[interim:${step.id}] ${step.text.slice(0, 20)}`,
    })
    this.pending.push(step)
  }
  private line(step: Extract<Step, { kind: 'utterance' }>): SttBatchTranscript {
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
    for (const step of ready) {
      const line = this.line(step)
      this.finals.push(line)
      this.opts.onTranscript({ ...line, isFinal: true })
      this.opts.onSignal?.({
        kind: 'boundary',
        channel: line.channel,
        atMs: line.tEndMs,
        source: 'endpoint',
      })
    }
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
function coveredLine(userContent: string): string {
  const stacked = userContent.split('Questions to answer')[1]?.split('These were asked')[0]
  const texts = stacked
    ? [...stacked.matchAll(/^\d+\. [^:\n]+: (.+)$/gm)].map((m) => m[1])
    : [...userContent.matchAll(/Respond to this completed turn[^\n]*\n[^:\n]+: (.+)/g)].map(
        (m) => m[1],
      )
  return texts.length ? `\nCovers: ${texts.join(' / ')}` : ''
}

/** Canned responses are derived from actual requests, never from expectations. */
export class RehearsalAssistant implements AssistantProvider {
  slowUntil = 0
  failUntil = 0
  readonly requests: { atMs: number; image?: string; answer: string }[] = []
  constructor(
    private readonly now: () => number,
    private readonly real?: AssistantProvider,
  ) {}
  async complete(req: AssistRequest): Promise<string> {
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
              : `**Confirm the delivery milestone and next owner.**\nUse the client context to agree the next action.${coveredLine(req.userContent)}`
      req.onDelta?.(answer)
    }
    this.requests.push({ atMs: this.now(), image: req.image?.base64, answer })
    return answer
  }
}
