// Main-process turn concepts. A "turn" is one speaker's contiguous stretch of finalized
// speech on one channel; it completes on acoustic evidence (an endpoint or utterance end
// plus a short continuation grace) or, without that evidence, after a silence fallback.
// These are not renderer IPC models — nothing here crosses the preload boundary.

import type { IdentityRole } from '../meetings/capture/channel-identity'

export type { IdentityRole }

/** One finalized transcript fragment, already resolved to an identity. */
export interface TurnFinal {
  channel: number
  /** Diarized index (-1 for the stereo user or an unknown voice). */
  speaker: number
  role: IdentityRole
  tStartMs: number
  tEndMs: number
  text: string
}

export type TurnCompletion = 'endpoint' | 'utterance-end' | 'silence' | 'speaker-change'

export interface CompletedTurn {
  /** Unique within one assembler lifetime (survives reset, so stale ids never collide). */
  id: number
  channel: number
  speaker: number
  role: IdentityRole
  /** Joined fragments, bounded (opening + recent text with an omission marker). */
  text: string
  /** Audio time of the first and last finalized word. */
  startMs: number
  endMs: number
  words: number
  fragments: number
  /** Receipt time (monotonic, ms) the turn completed. */
  completedAt: number
  reason: TurnCompletion
}

/** What happened in response to one input: turns that completed because of it. */
export type TurnOutput = CompletedTurn[]
