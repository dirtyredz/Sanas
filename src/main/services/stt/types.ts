// The STT seam. All speech-to-text goes through this interface so the
// provider (Deepgram today) can be swapped without touching orchestration.

export interface SttTranscript {
  isFinal: boolean
  /** Audio channel the words arrived on (0 = mic/user, 1 = system loopback). -1 when a
   *  multichannel provider message did not say which channel it was (identity unknown). */
  channel: number
  speaker: number
  tStartMs: number
  tEndMs: number
  text: string
}

export interface SttSessionOptions {
  apiKey: string
  /** 1 = mono mic; 2 = interleaved mic + loopback (transcribed per channel). */
  channels: number
  /** Glossary terms boosted for recognition (the sanas double-duty). */
  keyterms: string[]
  /** Audio time this session starts at, so a resumed meeting keeps one clock.
   *  Provider clocks restart at zero per connection; this is added to them. The caller
   *  owns the clock — it counts audio captured, which a provider cannot see. */
  startOffsetMs?: number
  onTranscript: (t: SttTranscript) => void
  /** Streaming-only turn evidence (boundaries, speech activity, lost continuity). Optional:
   *  a provider without it still works, turns then close on the silence fallback. */
  onSignal?: (s: SttSignal) => void
  onError: (message: string) => void
}

/** Streaming turn evidence. These are acoustic signals, not proof that a thought is
 *  complete. Times are absolute meeting audio time, like transcript times.
 *  - boundary: the speaker paused (provider endpoint) or a word gap passed (utterance end).
 *    Every final belonging to the same provider message is delivered before it.
 *  - activity: speech is happening on a channel (interims, voice-activity events). It says
 *    nothing about WHO is speaking.
 *  - reset: connection continuity was lost; anything assembled so far is incomplete. */
export type SttSignal =
  | { kind: 'boundary'; channel: number; atMs: number; source: 'endpoint' | 'utterance-end' }
  | { kind: 'activity'; channel: number; atMs: number }
  | { kind: 'reset' }

export interface SttSession {
  /** 16 kHz linear16 PCM, interleaved when channels > 1. */
  sendAudio(chunk: Buffer): void
  stop(): Promise<void>
}

export interface SttBatchOptions {
  apiKey: string
  channels: number
  keyterms: string[]
}

/** Batch results are all final by definition — the streaming-only flag is omitted. */
export type SttBatchTranscript = Omit<SttTranscript, 'isFinal'>

export interface SttProvider {
  start(opts: SttSessionOptions): Promise<SttSession>
  /** Batch-transcribe a finished recording. Batch diarization sees the whole
   *  file with lookahead, so speaker labels are far more stable than streaming. */
  transcribeFile(wavPath: string, opts: SttBatchOptions): Promise<SttBatchTranscript[]>
}
