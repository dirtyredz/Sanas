// The STT seam. All speech-to-text goes through this interface so the
// provider (Deepgram today) can be swapped without touching orchestration.

export interface SttTranscript {
  isFinal: boolean
  /** Audio channel the words arrived on (0 = mic/user, 1 = system loopback). */
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
   *  Provider clocks restart at zero per connection; this is added to them. */
  startOffsetMs?: number
  onTranscript: (t: SttTranscript) => void
  onError: (message: string) => void
}

export interface SttSession {
  /** 16 kHz linear16 PCM, interleaved when channels > 1. */
  sendAudio(chunk: Buffer): void
  /** Audio time reached so far, including `startOffsetMs`. Hand it to the next
   *  session's `startOffsetMs` to continue a paused meeting's clock. */
  elapsedMs(): number
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
