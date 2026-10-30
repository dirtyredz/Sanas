// When to suggest the user's next point while THEY are talking. Pure: no timers, no APIs —
// the caller passes receipt time (`now`, monotonic ms) and asks `decide` on each user final
// and whenever `nextCheckAt` passes.
//
// An explanation EPISODE is consecutive confirmed-user speech. It ends when another speaker
// takes the floor, identity becomes uncertain, or the user has been silent for 8 s. Speech
// time is the union of finalized audio intervals (gaps and overlaps never count twice);
// words are finalized words only. Transport and finalization latency delay the pause path,
// so "pause" here is evidence-based, not a measurement of physical silence.

export const LONG_SPEECH_MS = 20_000
export const LONG_WORDS = 40
export const PAUSE_SPEECH_MS = 8_000
export const PAUSE_WORDS = 20
export const PAUSE_MS = 1_800
export const EPISODE_SILENCE_MS = 8_000
export const COACH_COOLDOWN_MS = 30_000
export const NEW_WORDS = 20
export const NEW_SPEECH_MS = 8_000
const EXCERPT_CHARS = 2_000

export type CoachReason = 'long' | 'pause'

interface Episode {
  intervals: [number, number][] // merged, sorted
  speechMs: number
  words: number
  excerpt: string
  /** The latest user turn has completed (the assembler said so). */
  turnComplete: boolean
  /** Receipt time of the last advancing user speech evidence. */
  lastAdvanceAt: number
  /** Ambiguous activity (mono VAD/interims) arrived after the last user transcript. */
  pauseBlocked: boolean
}

interface Attempt {
  at: number
  words: number
  speechMs: number
}

function addInterval(intervals: [number, number][], start: number, end: number): number {
  if (!(end > start)) return 0
  const merged: [number, number][] = []
  let [s, e] = [start, end]
  let placed = false
  for (const [a, b] of intervals) {
    if (b < s) merged.push([a, b])
    else if (a > e) {
      if (!placed) {
        merged.push([s, e])
        placed = true
      }
      merged.push([a, b])
    } else {
      s = Math.min(s, a)
      e = Math.max(e, b)
    }
  }
  if (!placed) merged.push([s, e])
  const before = intervals.reduce((sum, [a, b]) => sum + (b - a), 0)
  const after = merged.reduce((sum, [a, b]) => sum + (b - a), 0)
  intervals.splice(0, intervals.length, ...merged)
  return after - before
}

function wordCount(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

export class CoachPolicy {
  private episode: Episode | null = null
  private totalWords = 0
  private totalSpeechMs = 0
  private lastAttempt: Attempt | null = null

  /** A finalized fragment confirmed as the user's own speech. */
  userFinal(f: { tStartMs: number; tEndMs: number; text: string }, now: number): void {
    this.expire(now)
    const ep =
      this.episode ??
      (this.episode = {
        intervals: [],
        speechMs: 0,
        words: 0,
        excerpt: '',
        turnComplete: false,
        lastAdvanceAt: now,
        pauseBlocked: false,
      })
    const gained = addInterval(ep.intervals, f.tStartMs, f.tEndMs)
    const words = wordCount(f.text)
    ep.speechMs += gained
    ep.words += words
    this.totalSpeechMs += gained
    this.totalWords += words
    ep.excerpt = `${ep.excerpt} ${f.text.trim()}`.trim().slice(-EXCERPT_CHARS)
    ep.turnComplete = false
    ep.lastAdvanceAt = now
    ep.pauseBlocked = false // transcript evidence establishes identity again
  }

  /** The user's current turn completed (endpoint + grace, or the silence fallback). */
  userTurnCompleted(now: number): void {
    this.expire(now)
    if (this.episode) this.episode.turnComplete = true
  }

  /** Advancing speech known to be the user's (a stereo mic-channel interim or VAD event). */
  userActivity(now: number): void {
    this.expire(now)
    if (!this.episode) return
    this.episode.lastAdvanceAt = now
    this.episode.turnComplete = false
  }

  /** Speech of unknown identity (mono VAD/interims): no pause until a transcript says who. */
  ambiguousActivity(now: number): void {
    this.expire(now)
    if (this.episode) this.episode.pauseBlocked = true
  }

  /** Another speaker took the floor, or identity became uncertain: the episode ends. */
  endEpisode(): void {
    this.episode = null
  }

  private expire(now: number): void {
    if (this.episode && now - this.episode.lastAdvanceAt > EPISODE_SILENCE_MS) this.episode = null
  }

  /** Whether a coach attempt may be dispatched now, and why. */
  decide(now: number, enabled: boolean): CoachReason | null {
    if (!enabled) return null
    this.expire(now)
    const ep = this.episode
    if (!ep) return null
    const last = this.lastAttempt
    if (last) {
      if (now - last.at < COACH_COOLDOWN_MS) return null
      const fresh =
        this.totalWords - last.words >= NEW_WORDS ||
        this.totalSpeechMs - last.speechMs >= NEW_SPEECH_MS
      if (!fresh) return null // nothing new said since the last attempt
    }
    if (ep.speechMs >= LONG_SPEECH_MS && ep.words >= LONG_WORDS) return 'long'
    if (
      ep.speechMs >= PAUSE_SPEECH_MS &&
      ep.words >= PAUSE_WORDS &&
      ep.turnComplete &&
      !ep.pauseBlocked &&
      now - ep.lastAdvanceAt >= PAUSE_MS
    ) {
      return 'pause'
    }
    return null
  }

  /** Records a dispatch (successful or not): the cooldown runs from here. */
  attempted(now: number): void {
    this.lastAttempt = { at: now, words: this.totalWords, speechMs: this.totalSpeechMs }
  }

  /** The next receipt time `decide` could change its answer without new input, or null. */
  nextCheckAt(now: number): number | null {
    const ep = this.episode
    if (!ep) return null
    const candidates = [ep.lastAdvanceAt + PAUSE_MS, ep.lastAdvanceAt + EPISODE_SILENCE_MS + 1]
    if (this.lastAttempt) candidates.push(this.lastAttempt.at + COACH_COOLDOWN_MS)
    const future = candidates.filter((t) => t > now)
    return future.length > 0 ? Math.min(...future) : null
  }

  /** The current explanation, most recent words kept. */
  excerpt(): string {
    return this.episode?.excerpt ?? ''
  }

  /** Forget the current episode (pause, reconnect, pin change). Attempt history stays,
   *  so a reconnect cannot be used to dodge the cooldown. */
  resetEpisode(): void {
    this.episode = null
  }

  /** A new or resumed meeting: everything starts over. */
  reset(): void {
    this.episode = null
    this.totalWords = 0
    this.totalSpeechMs = 0
    this.lastAttempt = null
  }
}
