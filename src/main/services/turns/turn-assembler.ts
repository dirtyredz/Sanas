import type { CompletedTurn, IdentityRole, TurnCompletion, TurnFinal } from './types'

// Pure turn assembly: finals in, completed turns out. Owns no timers and calls no APIs —
// the caller passes receipt time (`now`, monotonic ms) and calls `tick` when
// `nextDeadline()` passes. Audio time (provider timestamps) orders speech; receipt time
// drives the grace period and the silence fallback.
//
// Rules (docs/plans/turn-detection-and-coach.md §4):
//  - channels assemble independently; within one, contiguous finals of one speaker join;
//  - a confirmed speaker change in FINAL text closes the previous turn (an interim cannot);
//  - an endpoint / utterance end schedules completion after a short continuation grace,
//    and speech beyond the boundary inside that grace cancels it;
//  - a boundary older than speech already observed is rejected, and a completed turn
//    cannot complete twice;
//  - with no usable boundary, a turn closes after a stretch without advancing speech;
//  - reset discards everything unfinished (pause, stop, reconnect, identity change).

export const CONTINUATION_GRACE_MS = 350
export const SILENCE_FALLBACK_MS = 1_800
export const TURN_TEXT_CAP = 12_000
const HEAD_CHARS = 4_000
const OMISSION = ' […] '
const TAIL_CHARS = TURN_TEXT_CAP - HEAD_CHARS - OMISSION.length
/** A boundary may trail interim timestamps of the same words slightly. Real new speech
 *  is always further away than this: endpointing needs 600 ms of silence. */
const BOUNDARY_TOLERANCE_MS = 250
const SEEN_LIMIT = 400

interface OpenTurn {
  id: number
  channel: number
  speaker: number
  role: IdentityRole
  head: string
  tail: string
  overflowed: boolean
  startMs: number
  endMs: number
  words: number
  fragments: number
  lastAdvanceAt: number
  completeAt: number | null
  completeSource: 'endpoint' | 'utterance-end' | null
  boundaryAtMs: number
}

interface ChannelState {
  open: OpenTurn | null
  /** Latest audio time of any speech seen on the channel (finals, interims, VAD). */
  speechMs: number
  /** Fragments already taken in this epoch: identical time + text is a duplicate. */
  seen: Set<string>
}

function wordCount(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

function appendText(turn: OpenTurn, piece: string): void {
  if (!turn.overflowed) {
    const joined = turn.head ? `${turn.head} ${piece}` : piece
    if (joined.length <= TURN_TEXT_CAP) {
      turn.head = joined
      return
    }
    turn.overflowed = true
    turn.head = joined.slice(0, HEAD_CHARS)
    turn.tail = joined.slice(HEAD_CHARS).slice(-TAIL_CHARS)
    return
  }
  turn.tail = `${turn.tail} ${piece}`.slice(-TAIL_CHARS)
}

function turnText(turn: OpenTurn): string {
  return turn.overflowed ? `${turn.head}${OMISSION}${turn.tail}` : turn.head
}

export class TurnAssembler {
  private channels = new Map<number, ChannelState>()
  private nextId = 1

  private state(channel: number): ChannelState {
    let ch = this.channels.get(channel)
    if (!ch) {
      ch = { open: null, speechMs: Number.NEGATIVE_INFINITY, seen: new Set() }
      this.channels.set(channel, ch)
    }
    return ch
  }

  private complete(ch: ChannelState, reason: TurnCompletion, now: number): CompletedTurn {
    const t = ch.open as OpenTurn
    ch.open = null
    return {
      id: t.id,
      channel: t.channel,
      speaker: t.speaker,
      role: t.role,
      text: turnText(t),
      startMs: t.startMs,
      endMs: t.endMs,
      words: t.words,
      fragments: t.fragments,
      completedAt: now,
      reason,
    }
  }

  /** A finalized fragment. `accepted` is false for an empty or duplicate fragment;
   *  `completed` holds a turn it closed by changing speaker, if any. */
  final(f: TurnFinal, now: number): { accepted: boolean; completed: CompletedTurn[] } {
    const rejected = { accepted: false, completed: [] }
    const text = f.text.trim()
    if (!text) return rejected
    const ch = this.state(f.channel)
    const key = `${f.tStartMs}|${f.tEndMs}|${text}`
    if (ch.seen.has(key)) return rejected
    if (ch.seen.size >= SEEN_LIMIT) ch.seen.clear()
    ch.seen.add(key)

    const out: CompletedTurn[] = []
    const open = ch.open
    // an unknown-identity fragment is not a confirmed change: it joins what is open
    if (open && f.role !== 'unknown' && (open.role !== f.role || open.speaker !== f.speaker)) {
      out.push(this.complete(ch, 'speaker-change', now))
    }
    if (!ch.open) {
      ch.open = {
        id: this.nextId++,
        channel: f.channel,
        speaker: f.speaker,
        role: f.role,
        head: '',
        tail: '',
        overflowed: false,
        startMs: f.tStartMs,
        endMs: f.tEndMs,
        words: 0,
        fragments: 0,
        lastAdvanceAt: now,
        completeAt: null,
        completeSource: null,
        boundaryAtMs: Number.NEGATIVE_INFINITY,
      }
    }
    const turn = ch.open
    appendText(turn, text)
    turn.startMs = Math.min(turn.startMs, f.tStartMs)
    turn.endMs = Math.max(turn.endMs, f.tEndMs)
    turn.words += wordCount(text)
    turn.fragments++
    turn.lastAdvanceAt = now
    ch.speechMs = Math.max(ch.speechMs, f.tEndMs)
    if (turn.completeAt !== null && f.tEndMs > turn.boundaryAtMs + BOUNDARY_TOLERANCE_MS) {
      turn.completeAt = null // the speaker carried on past the boundary
      turn.completeSource = null
    }
    return { accepted: true, completed: out }
  }

  /** Speech is happening on a channel (an interim or voice activity). Identity-free. */
  activity(channel: number, atMs: number, now: number): void {
    const ch = this.state(channel)
    if (!(atMs > ch.speechMs)) return
    ch.speechMs = atMs
    const turn = ch.open
    if (!turn) return
    turn.lastAdvanceAt = now
    if (turn.completeAt !== null && atMs > turn.boundaryAtMs + BOUNDARY_TOLERANCE_MS) {
      turn.completeAt = null
      turn.completeSource = null
    }
  }

  /** Acoustic boundary evidence for a channel. */
  boundary(channel: number, atMs: number, source: 'endpoint' | 'utterance-end', now: number): void {
    const ch = this.channels.get(channel)
    const turn = ch?.open
    if (!ch || !turn) return // nothing open: a duplicate, or speech we never saw
    if (ch.speechMs > atMs + BOUNDARY_TOLERANCE_MS) return // older than newer speech
    if (turn.completeAt !== null) return // already scheduled
    turn.completeAt = now + CONTINUATION_GRACE_MS
    turn.completeSource = source
    turn.boundaryAtMs = atMs
  }

  /** Completes every turn whose grace or silence fallback has run out. */
  tick(now: number): CompletedTurn[] {
    const out: CompletedTurn[] = []
    for (const ch of this.channels.values()) {
      const turn = ch.open
      if (!turn) continue
      if (turn.completeAt !== null && now >= turn.completeAt) {
        out.push(this.complete(ch, turn.completeSource ?? 'endpoint', now))
      } else if (now - turn.lastAdvanceAt >= SILENCE_FALLBACK_MS) {
        out.push(this.complete(ch, 'silence', now))
      }
    }
    return out
  }

  /** Receipt time at which `tick` next has something to do, or null when nothing is open. */
  nextDeadline(): number | null {
    let next: number | null = null
    for (const ch of this.channels.values()) {
      const turn = ch.open
      if (!turn) continue
      const at = turn.completeAt ?? turn.lastAdvanceAt + SILENCE_FALLBACK_MS
      next = next === null ? at : Math.min(next, at)
    }
    return next
  }

  /** Discards every unfinished turn and the duplicate memory. Never emits. */
  reset(): void {
    this.channels.clear()
  }
}
