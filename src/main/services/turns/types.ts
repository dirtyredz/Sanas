// Main-process turn concepts. A "turn" is one speaker's contiguous stretch of finalized
// speech on one channel; it completes on acoustic evidence (an endpoint or utterance end
// plus a short continuation grace) or, without that evidence, after a silence fallback.
// These are not renderer IPC models — nothing here crosses the preload boundary.

/** How sure an identity is. 'unknown' never initiates coaching, and in stereo it is what a
 *  provider message without a usable channel becomes, instead of implicit user speech. */
export type IdentityRole = 'user' | 'other' | 'unknown'

/** One finalized transcript fragment, already resolved to an identity. */
export interface TurnFinal {
  channel: number
  /** Diarized index (-1 for the stereo user or an unknown voice). */
  speaker: number
  role: IdentityRole
  tStartMs: number
  tEndMs: number
  text: string
  /** Monotonic time the provider message carrying it reached the meeting, before it was
   *  persisted (evidence only). */
  ingressAt?: number
  /** The meeting's audio clock (PCM received) at that moment (evidence only). */
  audioCursorMs?: number
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
  /** How the turn came to close, as timing evidence. Never drives policy. */
  assembly?: TurnAssemblyTiming
}

/** Turn-close timing for one completed turn (monotonic ms unless named audio). Each field is
 *  absent when it does not apply (no boundary, no ingress stamp, a speaker-change close). */
export interface TurnAssemblyTiming {
  /** Ingress of the last final → the assembler receiving it (synchronous persistence etc.). */
  ingressToAssemblyMs?: number
  /** The assembler receiving the last final → the turn closing. */
  lastFinalToCloseMs: number
  /** The accepted boundary's receipt → the turn closing (grace plus timer lateness). */
  boundaryToCloseMs?: number
  /** How late the completion timer fired after its deadline. */
  timerLatenessMs?: number
  boundarySource?: 'endpoint' | 'utterance-end'
  /** Boundaries accepted, rejected as stale/duplicate, and pending completions cancelled by
   *  advancing speech, over the turn's life (capped counters). */
  boundariesAccepted: number
  boundariesRejected: number
  completionsCancelled: number
  /** PROXY, audio clock: how far captured audio had run past the last final's end when that
   *  final arrived. Not speech-end latency; never mixed with monotonic times. */
  audioCursorGapMs?: number
}

/** What happened in response to one input: turns that completed because of it. */
export type TurnOutput = CompletedTurn[]
