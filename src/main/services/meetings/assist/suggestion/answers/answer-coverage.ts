import { hasReadableText } from '@shared/live-controls/readable-suggestion'
import type { SuggestionEvent } from '@shared/types'
import type { AnswerSelection } from '@shared/live-controls/types'
import type { SuggestionLifecycle } from '../suggestion-runner'

export interface AnswerOccurrence {
  id: number
  channel: number
  text: string
}
declare const reservationBrand: unique symbol
/** Opaque handle: callers pass it back to AnswerCoverage operations and nothing else. */
export interface AnswerReservation {
  readonly [reservationBrand]: true
}
interface Entry {
  readonly token: symbol
  readonly keys: readonly string[]
  readonly lane: 'automatic' | 'manual'
  cancel(): void
  card?: AnswerSelection
  settledAt?: number
  attempt: number
}
const inner = (r: AnswerReservation): Entry => r as unknown as Entry

const key = (meeting: number, q: AnswerOccurrence): string =>
  JSON.stringify([meeting, q.channel, q.id, q.text.trim().replace(/\s+/g, ' ')])

/** Meeting-local ownership, independent of prompts and stacked-question bookkeeping.
 * Active attempts survive expiry; completed cards expire with the 90-second question window. */
export class AnswerCoverage {
  private entries = new Map<string, Entry>()
  constructor(
    private now: () => number,
    private select: (card: AnswerSelection) => void = () => {},
  ) {}

  reset(): void {
    const active = new Set(this.entries.values())
    this.entries.clear()
    for (const entry of active) if (!entry.card) entry.cancel()
  }

  find(meeting: number, q: AnswerOccurrence): AnswerReservation | undefined {
    this.prune()
    return this.entries.get(key(meeting, q)) as unknown as AnswerReservation | undefined
  }

  /** Re-select the already-shown card; returns its suggestion id, or null if none yet. */
  reuse(reservation: AnswerReservation): number | null {
    const entry = inner(reservation)
    if (!entry.card) return null
    this.select({ ...entry.card })
    return entry.card.suggestionId
  }

  reserve(
    meeting: number,
    questions: readonly AnswerOccurrence[],
    lane: Entry['lane'],
    cancel: () => void,
  ): AnswerReservation | null {
    this.prune()
    const keys = questions.map((q) => key(meeting, q))
    const conflicts = new Set(keys.map((k) => this.entries.get(k)).filter((e) => !!e))
    if ([...conflicts].some((e) => e.card || lane === 'automatic' || e.lane === 'manual'))
      return null
    for (const entry of conflicts) {
      this.drop(entry)
      entry.cancel()
    }
    const entry: Entry = { token: Symbol(), keys, lane, cancel, attempt: 0 }
    for (const k of keys) this.entries.set(k, entry)
    return entry as unknown as AnswerReservation
  }

  owns(reservation: AnswerReservation): boolean {
    const entry = inner(reservation)
    return entry.keys.every((k) => this.entries.get(k)?.token === entry.token)
  }

  release(reservation: AnswerReservation): void {
    this.drop(inner(reservation))
  }

  /** Release only while nothing has been published; a shown card keeps its ownership. */
  releaseUnpublished(reservation: AnswerReservation): void {
    const entry = inner(reservation)
    if (!entry.card) this.drop(entry)
  }

  /** Make cancelling the reservation also cancel the run that now serves it. */
  attachRunCancel(reservation: AnswerReservation, cancelRun: () => void): void {
    const entry = inner(reservation)
    const previous = entry.cancel
    entry.cancel = () => {
      previous()
      cancelRun()
    }
  }

  private drop(entry: Entry): void {
    for (const k of entry.keys) if (this.entries.get(k) === entry) this.entries.delete(k)
  }

  /** Runner callbacks are authoritative; stale run settlement cannot release a newer attempt. */
  lifecycle(reservation: AnswerReservation, published: () => void = () => {}): SuggestionLifecycle {
    const entry = inner(reservation)
    const attempt = ++entry.attempt
    const valid = (): boolean => this.owns(reservation) && attempt === entry.attempt
    return {
      valid,
      event: (event: SuggestionEvent) => {
        if (!valid() || event.kind === 'error') return
        const first = !entry.card
        entry.card = {
          ...event,
          text: event.kind === 'delta' ? (entry.card?.text ?? '') + event.text : event.text,
          streaming: event.kind === 'start' || event.kind === 'delta',
        }
        if (first) published()
      },
      settled: (outcome) => {
        if (!valid()) return
        if (outcome === 'done' && entry.card && hasReadableText(entry.card.text))
          entry.settledAt = this.now()
        else this.drop(entry)
      },
    }
  }

  private prune(): void {
    for (const entry of new Set(this.entries.values()))
      if (entry.settledAt !== undefined && this.now() - entry.settledAt > 90_000) this.drop(entry)
  }
}
