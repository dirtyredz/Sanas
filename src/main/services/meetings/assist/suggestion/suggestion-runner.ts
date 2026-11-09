import { effectiveProfile, observeRun } from '../../observation/run-observation'
import type { SuggestionMetadata } from '@shared/live-controls/types'
import type { SuggestionEvent, SuggestionPurpose, SuggestionTrigger } from '@shared/types'
import type { AssistantProvider, AssistImage } from '../../../assistant/types'
import { hasReadableText, isNoSuggestion } from '@shared/live-controls/readable-suggestion'
import { RunPublication } from './run-publication'
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
// (that is why the hold exists); buffered next points and answers with no visible card
// are cancellable.
//
// A speculative answer (`speculate`) is an automatic answer started before the classifier
// has agreed it is wanted. It owns the ambient lane and the meeting hold like any run, but it
// is UNPUBLISHED: no visible event and no persistence until `promote()`. Until then
// `cancel()` discards it silently, whatever the provider already returned, and a provider
// failure or timeout ends it with nothing shown. Once promoted it is an ordinary streamed
// answer and, once visible, can no longer be withdrawn.

export interface SuggestionRequest extends SuggestionMetadata {
  profile?: 'full' | 'smart' | 'points'
  diagnosticTurns?: readonly { startMs: number; endMs: number; completedAt: number }[]
  /** Legacy deck grounding, replayed only by More detail on answers recorded with a deck. */
  cacheableContext?: string
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

/** 'discarded': a speculative answer that ended unpublished (rejected, failed, timed out or
 *  superseded). Nothing was shown or stored for it. */
export type SuggestionOutcome = 'done' | 'noop' | 'cancelled' | 'timeout' | 'error' | 'discarded'

export interface SuggestionLifecycle {
  valid(): boolean
  event(event: SuggestionEvent): void
  settled(outcome: SuggestionOutcome): void
}

export interface SuggestionHandle {
  /** The suggestion id its events carry; correlates diagnostics with the run. */
  readonly id: number
  readonly done: Promise<SuggestionOutcome>
  /** Abort and free the lane now. Nothing further is published for this request. */
  cancel(): void
}

export interface SpeculativeHandle extends SuggestionHandle {
  /** Publish it as an ordinary streamed answer: held text is shown once it cannot be the
   *  no-op, a held complete result is stored and shown. False when the run already ended
   *  unpublished (failed, timed out, discarded): the caller takes the ordinary path. */
  promote(): boolean
  /** Discards it until a card is visible (nothing stored); a no-op once visible. */
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
  /** Monotonic clock for stage evidence; performance.now() when omitted. */
  now?: () => number
}

const NO_KEY = 'No Anthropic API key set — add it in Settings.'

export class SuggestionRunner {
  private lanes: Record<SuggestionTrigger, symbol | null> = { ambient: null, hotkey: null }
  private seq = 0

  private readonly now: () => number

  constructor(private deps: SuggestionRunnerDeps) {
    this.now = deps.now ?? (() => performance.now())
  }

  inFlight(): SuggestionInFlight {
    return { ambient: this.lanes.ambient !== null, hotkey: this.lanes.hotkey !== null }
  }

  canStart(trigger: SuggestionTrigger): boolean {
    return canStartSuggestion(this.inFlight(), trigger)
  }

  /** Starts a request, or returns null when its lane is taken or there is no API key. */
  start(request: SuggestionRequest, lifecycle?: SuggestionLifecycle): SuggestionHandle | null {
    return this.launch(request, false, lifecycle)
  }

  /** Starts a streamed automatic answer unpublished, or returns null when the ambient lane is
   *  taken or there is no API key (silently: a speculation never shows an error). */
  speculate(request: SuggestionRequest, lifecycle?: SuggestionLifecycle): SpeculativeHandle | null {
    if (request.trigger !== 'ambient' || request.delivery !== 'stream' || !request.apiKey)
      return null
    return this.launch(request, true, lifecycle)
  }

  private launch(
    request: SuggestionRequest,
    speculative: boolean,
    lifecycle?: SuggestionLifecycle,
  ): SpeculativeHandle | null {
    const req = { ...request } // the snapshot this run uses, whatever the caller does next
    if (!this.canStart(req.trigger) || (lifecycle && !lifecycle.valid())) return null
    const sid = ++this.seq
    let storedSuggestionId: number | undefined
    const metadata = {
      contextRevision: req.contextRevision,
      groundingContextId: req.groundingContextId,
      sourceSuggestionId: req.sourceSuggestionId,
      manualKind: req.manualKind,
      requestText: req.requestText,
    }
    observeRun({
      kind: 'begin',
      id: sid,
      meetingId: req.meetingId,
      purpose: req.purpose,
      trigger: req.trigger,
      spans: req.diagnosticTurns ?? [],
      effective: effectiveProfile(req),
      ...(speculative ? { speculative: true } : {}),
      at: this.now(),
    })
    let shownText = ''
    let readable = false
    const markReadable = (text: string): void => {
      if (readable || !hasReadableText(text)) return
      readable = true
      observeRun({ kind: 'first-readable', id: sid, meetingId: req.meetingId, at: this.now() })
    }
    const emit = (kind: SuggestionEvent['kind'], text: string): void => {
      const event: SuggestionEvent = {
        ...metadata,
        ...(storedSuggestionId === undefined ? {} : { storedSuggestionId }),
        suggestionId: sid,
        meetingId: req.meetingId,
        trigger: req.trigger,
        purpose: req.purpose,
        kind,
        text,
      }
      lifecycle?.event(event)
      this.deps.emit(event)
      if (kind === 'delta') markReadable((shownText += text))
      else if (kind === 'done') markReadable(text)
      observeRun({ kind: 'visible', event })
    }
    const streamed = req.delivery === 'stream'
    if (!req.apiKey) {
      if (streamed) emit('error', NO_KEY)
      observeRun({
        kind: 'settled',
        id: sid,
        meetingId: req.meetingId,
        outcome: 'error',
        at: this.now(),
      })
      return null
    }

    const token = Symbol(req.purpose)
    this.lanes[req.trigger] = token
    const releaseLane = (): void => {
      if (this.lanes[req.trigger] === token) this.lanes[req.trigger] = null
    }
    let cancelled = false
    const controller = new AbortController()
    // what is visible so far; a speculation also waits on it, after its provider call,
    // until it is promoted or discarded
    const gate = new RunPublication(!speculative, req.allowNoop, {
      start: () => emit('start', ''),
      delta: (text) => emit('delta', text),
    })
    let sawText = false
    if (streamed) gate.reveal()
    const onDelta = (delta: string): void => {
      if (cancelled) return // late text from a discarded speculation
      if (!sawText && delta) {
        sawText = true
        observeRun({ kind: 'first-text', id: sid, meetingId: req.meetingId, at: this.now() })
      }
      gate.push(delta)
    }
    // the request outlives the call that started it and ends in an insert against this
    // meeting, so it holds the meeting like any other background write. Everything after
    // this line is inside the try: a leaked hold makes the meeting un-mergeable forever.
    this.deps.hold(req.meetingId)
    const timeout = setTimeout(() => {
      controller.abort()
      gate.reject() // a held, unpromoted result never outlives the request deadline
    }, req.timeoutMs)

    const run = async (): Promise<SuggestionOutcome> => {
      try {
        const text = await this.deps.provider.complete({
          diagnostic: {
            suggestionId: sid,
            purpose: req.purpose,
            manualKind: req.manualKind ?? undefined,
            turns: req.diagnosticTurns,
          },
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
          // evidence only; a discarded speculation's spend is still counted
          onUsage: (usage) =>
            observeRun({ kind: 'usage', id: sid, meetingId: req.meetingId, usage }),
          onTiming: (timing) =>
            observeRun({ kind: 'provider', id: sid, meetingId: req.meetingId, timing }),
        })
        if (!gate.published && !(await gate.decision)) return 'discarded'
        if (cancelled) return 'cancelled'
        // declined: nothing displayed, nothing persisted; the lane frees in `finally`
        if (req.allowNoop && !gate.shown && isNoSuggestion(text)) return 'noop'
        if (!streamed && !(req.accept?.(text) ?? true)) return 'noop'
        if (!text.trim()) {
          if (gate.shown) emit('error', 'No answer returned. Try again.')
          return 'noop'
        }
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
        if (!gate.shown) emit('start', '') // buffered, or a short answer still being held
        emit('done', text)
        return 'done'
      } catch (e) {
        if (!gate.published) return 'discarded' // never shown, so never an error card either
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
        gate.end()
        clearTimeout(timeout)
        this.deps.release(req.meetingId)
        releaseLane()
      }
    }

    const done = run().then((outcome) => {
      lifecycle?.settled(outcome)
      observeRun({
        kind: 'settled',
        id: sid,
        meetingId: req.meetingId,
        outcome,
        storedSuggestionId,
        at: this.now(),
      })
      return outcome
    })
    return {
      id: sid,
      done,
      promote: () => {
        if (lifecycle && !lifecycle.valid()) return false
        if (gate.published) return !cancelled
        if (cancelled || !gate.publish()) return false
        observeRun({ kind: 'promoted', id: sid, meetingId: req.meetingId, at: this.now() })
        gate.reveal() // text already held is shown now, unless it could still be the no-op
        return true
      },
      cancel: () => {
        // Visible answers are never withdrawn; buffered or still-hidden work can be.
        if ((streamed && gate.shown) || cancelled) return
        cancelled = true
        releaseLane()
        controller.abort()
        gate.reject()
      },
    }
  }
}
