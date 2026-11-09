import { hasReadableText } from '@shared/live-controls/readable-suggestion'
import type { SuggestionEvent } from '@shared/types'
import type { AnswerSelection } from '@shared/live-controls/types'
import type { SuggestionLifecycle } from '../suggestion-runner'

export interface AnswerOccurrence {
  id: number
  channel: number
  text: string
}
export interface AnswerReservation {
  readonly token: symbol
  readonly keys: readonly string[]
  readonly lane: 'automatic' | 'manual'
  cancel(): void
  card?: AnswerSelection
  settledAt?: number
  attempt: number
}

const key = (meeting: number, q: AnswerOccurrence): string =>
  JSON.stringify([meeting, q.channel, q.id, q.text.trim().replace(/\s+/g, ' ')])

/** Meeting-local ownership, independent of prompts and stacked-question bookkeeping.
 * Active attempts survive expiry; completed cards expire with the 90-second question window. */
export class AnswerCoverage {
  private entries = new Map<string, AnswerReservation>()
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
    return this.entries.get(key(meeting, q))
  }

  reuse(entry: AnswerReservation): boolean {
    if (!entry.card) return false
    this.select({ ...entry.card })
    return true
  }

  reserve(
    meeting: number,
    questions: readonly AnswerOccurrence[],
    lane: AnswerReservation['lane'],
    cancel: () => void,
  ): AnswerReservation | null {
    this.prune()
    const keys = questions.map((q) => key(meeting, q))
    const conflicts = new Set(keys.map((k) => this.entries.get(k)).filter((e) => !!e))
    if ([...conflicts].some((e) => e.card || lane === 'automatic' || e.lane === 'manual'))
      return null
    for (const entry of conflicts) {
      this.release(entry)
      entry.cancel()
    }
    const entry: AnswerReservation = { token: Symbol(), keys, lane, cancel, attempt: 0 }
    for (const k of keys) this.entries.set(k, entry)
    return entry
  }

  owns(entry: AnswerReservation): boolean {
    return entry.keys.every((k) => this.entries.get(k)?.token === entry.token)
  }

  release(entry: AnswerReservation): void {
    for (const k of entry.keys) if (this.entries.get(k) === entry) this.entries.delete(k)
  }

  /** Runner callbacks are authoritative; stale run settlement cannot release a newer attempt. */
  lifecycle(entry: AnswerReservation, published: () => void = () => {}): SuggestionLifecycle {
    const attempt = ++entry.attempt
    const valid = (): boolean => this.owns(entry) && attempt === entry.attempt
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
        else this.release(entry)
      },
    }
  }

  private prune(): void {
    for (const entry of new Set(this.entries.values()))
      if (entry.settledAt !== undefined && this.now() - entry.settledAt > 90_000)
        this.release(entry)
  }
}
