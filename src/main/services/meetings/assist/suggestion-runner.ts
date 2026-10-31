import type { SuggestionMetadata } from '@shared/live-controls/types'
import type { SuggestionEvent, SuggestionPurpose, SuggestionTrigger } from '@shared/types'
import type { AssistantProvider, AssistImage } from '../../assistant/types'
import { couldBeNoSuggestion, isNoSuggestion } from '../../assistant/compact-contract'
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

export interface SuggestionRequest extends SuggestionMetadata {
  cacheableContext?: string
  presentationRevision?: number
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
  /** A screenshot held in memory for this one call; never persisted (promptWindow is the
   *  text only). Released with the request once it settles. */
  image?: AssistImage
  maxTokens: number
  effort: 'low' | 'medium' | 'high'
  timeoutMs: number
  maxRetries?: number
  /** 'stream' shows tokens as they arrive; 'buffered' publishes only a complete, accepted
   *  result (or nothing at all), so a cancelled or empty next point never leaves a card. */
  delivery: 'stream' | 'buffered'
  /** Automatic suggestions may decline with the no-op output (`<none>`): then nothing is
   *  shown or stored, and a streamed answer shows nothing until its text cannot be the
   *  no-op. Requested answers never decline. */
  allowNoop?: boolean
  /** Buffered only: last-moment check that the result is still useful and current. */
  accept?: (text: string) => boolean
}

export type SuggestionOutcome = 'done' | 'noop' | 'cancelled' | 'timeout' | 'error'

export interface SuggestionHandle {
  readonly done: Promise<SuggestionOutcome>
  /** Abort and free the lane now. Nothing further is published for this request. */
  cancel(): void
}

export interface StoredSuggestion extends SuggestionMetadata {
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
  persist: (s: StoredSuggestion) => number | void
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
    let storedSuggestionId: number | undefined
    const metadata = {
      contextRevision: req.contextRevision,
      groundingContextId: req.groundingContextId,
      sourceSuggestionId: req.sourceSuggestionId,
      manualKind: req.manualKind,
      requestText: req.requestText,
    }
    const emit = (kind: SuggestionEvent['kind'], text: string): void =>
      this.deps.emit({
        ...metadata,
        ...(storedSuggestionId === undefined ? {} : { storedSuggestionId }),
        suggestionId: sid,
        meetingId: req.meetingId,
        trigger: req.trigger,
        purpose: req.purpose,
        ...(req.presentationRevision === undefined
          ? {}
          : { presentationRevision: req.presentationRevision }),
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

    // a streamed answer that may decline is held back until it visibly is not the no-op
    let shown = streamed && !req.allowNoop
    let held = ''
    if (shown) emit('start', '')
    const onDelta = (delta: string): void => {
      if (shown) return emit('delta', delta)
      held += delta
      if (couldBeNoSuggestion(held)) return
      shown = true
      emit('start', '')
      emit('delta', held)
    }
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
          cacheableContext: req.cacheableContext,
          userContent: req.userContent,
          image: req.image,
          maxTokens: req.maxTokens,
          effort: req.effort,
          signal: controller.signal,
          timeoutMs: req.timeoutMs,
          maxRetries: req.maxRetries,
          onDelta: streamed ? onDelta : undefined,
        })
        if (cancelled) return 'cancelled'
        // declined: nothing displayed, nothing persisted; the lane frees in `finally`
        if (req.allowNoop && !shown && isNoSuggestion(text)) return 'noop'
        if (!streamed && !(req.accept?.(text) ?? true)) return 'noop'
        const stored = this.deps.persist({
          ...metadata,
          meetingId: req.meetingId,
          tMs: req.atMs,
          trigger: req.trigger,
          purpose: req.purpose,
          promptWindow: req.userContent,
          text,
        })
        storedSuggestionId = typeof stored === 'number' ? stored : undefined
        if (!shown) emit('start', '') // buffered, or a short answer still being held
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
