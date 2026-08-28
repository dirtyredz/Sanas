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
  onTranscript: (t: SttTranscript) => void
  onError: (message: string) => void
}

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

export interface SttProvider {
  start(opts: SttSessionOptions): Promise<SttSession>
  /** Batch-transcribe a finished recording. Batch diarization sees the whole
   *  file with lookahead, so speaker labels are far more stable than streaming. */
  transcribeFile(wavPath: string, opts: SttBatchOptions): Promise<SttTranscript[]>
}
