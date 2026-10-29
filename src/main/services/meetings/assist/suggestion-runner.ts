import type { SuggestionEvent, SuggestionPurpose, SuggestionTrigger } from '@shared/types'
import type { AssistantProvider } from '../../assistant/types'
import { canStartSuggestion, type SuggestionInFlight } from './suggestion-in-flight'

// Runs one suggestion end to end: lane ownership, deadline, provider call, events,
// persistence, and the meeting's post-processing hold. Everything a request needs is
// captured in the request itself BEFORE any await (meeting id, audio time, prompt, model),
// so a later settings change or a new meeting cannot alter a request already running.
//
// Two lanes, one request each: 'ambient' (automatic answers and next points) and 'hotkey'
// ("Answer now"). Each run owns its lane through a token: cancelling a next point frees the
// lane at once so an answer can take it, and the cancelled run's late `finally` cannot
// release the newer owner. An answer that started before Stop still finishes and persists
// (that is why the hold exists); only buffered next points are cancellable.

export interface SuggestionRequest {
  meetingId: number
  trigger: SuggestionTrigger
  purpose: SuggestionPurpose
  /** Audio time the suggestion belongs to (the meeting clock when it was requested). */
  atMs: number
  apiKey: string
  workspaceId?: string
  model: string
  system: string
  userContent: string
  maxTokens: number
  effort: 'low' | 'medium' | 'high'
  timeoutMs: number
  maxRetries?: number
  /** 'stream' shows tokens as they arrive; 'buffered' publishes only a complete, accepted
   *  result (or nothing at all), so a cancelled or empty next point never leaves a card. */
  delivery: 'stream' | 'buffered'
  /** Buffered only: last-moment check that the result is still useful and current. */
  accept?: (text: string) => boolean
}

export type SuggestionOutcome = 'done' | 'noop' | 'cancelled' | 'timeout' | 'error'

export interface SuggestionHandle {
  readonly done: Promise<SuggestionOutcome>
  /** Abort and free the lane now. Nothing further is published for this request. */
  cancel(): void
}

export interface StoredSuggestion {
  meetingId: number
  tMs: number
  trigger: SuggestionTrigger
  purpose: SuggestionPurpose
  promptWindow: string
  text: string
}

export interface SuggestionRunnerDeps {
  provider: AssistantProvider
  emit: (event: SuggestionEvent) => void
  persist: (s: StoredSuggestion) => void
  hold: (meetingId: number) => void
  release: (meetingId: number) => void
  log: (message: string) => void
}

const NO_KEY = 'No Anthropic API key set — add it in Settings.'

export class SuggestionRunner {
  private lanes: Record<SuggestionTrigger, symbol | null> = { ambient: null, hotkey: null }
  private seq = 0

  constructor(private deps: SuggestionRunnerDeps) {}

  inFlight(): SuggestionInFlight {
    return { ambient: this.lanes.ambient !== null, hotkey: this.lanes.hotkey !== null }
  }

  canStart(trigger: SuggestionTrigger): boolean {
    return canStartSuggestion(this.inFlight(), trigger)
  }

  /** Starts a request, or returns null when its lane is taken or there is no API key. */
  start(request: SuggestionRequest): SuggestionHandle | null {
    const req = { ...request } // the snapshot this run uses, whatever the caller does next
    if (!this.canStart(req.trigger)) return null
    const sid = ++this.seq
    const emit = (kind: SuggestionEvent['kind'], text: string): void =>
      this.deps.emit({
        suggestionId: sid,
        meetingId: req.meetingId,
        trigger: req.trigger,
        purpose: req.purpose,
        kind,
        text,
      })
    const streamed = req.delivery === 'stream'
    if (!req.apiKey) {
      if (streamed) emit('error', NO_KEY)
      return null
    }

    const token = Symbol(req.purpose)
    this.lanes[req.trigger] = token
    const releaseLane = (): void => {
      if (this.lanes[req.trigger] === token) this.lanes[req.trigger] = null
    }
    let cancelled = false
    const controller = new AbortController()

    if (streamed) emit('start', '')
    // the request outlives the call that started it and ends in an insert against this
    // meeting, so it holds the meeting like any other background write. Everything after
    // this line is inside the try: a leaked hold makes the meeting un-mergeable forever.
    this.deps.hold(req.meetingId)
    const timeout = setTimeout(() => controller.abort(), req.timeoutMs)

    const run = async (): Promise<SuggestionOutcome> => {
      try {
        const text = await this.deps.provider.complete({
          apiKey: req.apiKey,
          workspaceId: req.workspaceId,
          model: req.model,
          system: req.system,
          userContent: req.userContent,
          maxTokens: req.maxTokens,
          effort: req.effort,
          signal: controller.signal,
          timeoutMs: req.timeoutMs,
          maxRetries: req.maxRetries,
          onDelta: streamed ? (delta) => emit('delta', delta) : undefined,
        })
        if (cancelled) return 'cancelled'
        if (!streamed && !(req.accept?.(text) ?? true)) return 'noop'
        this.deps.persist({
          meetingId: req.meetingId,
          tMs: req.atMs,
          trigger: req.trigger,
          purpose: req.purpose,
          promptWindow: req.userContent,
          text,
        })
        if (!streamed) emit('start', '')
        emit('done', text)
        return 'done'
      } catch (e) {
        if (cancelled) return 'cancelled'
        const timedOut = controller.signal.aborted
        if (streamed) {
          emit(
            'error',
            timedOut
              ? `Answer timed out after ${req.timeoutMs / 1000} seconds — try again.`
              : e instanceof Error
                ? e.message
                : String(e),
          )
        } else {
          // a next point that failed is simply not shown; no error card per failure
          this.deps.log(`next point ${timedOut ? 'timed out' : 'failed'}`)
        }
        return timedOut ? 'timeout' : 'error'
      } finally {
        clearTimeout(timeout)
        this.deps.release(req.meetingId)
        releaseLane()
      }
    }

    const done = run()
    return {
      done,
      cancel: () => {
        if (streamed || cancelled) return // answers are never withdrawn once started
        cancelled = true
        releaseLane()
        controller.abort()
      },
    }
  }
}
