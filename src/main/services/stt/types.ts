// The STT seam. All speech-to-text goes through this interface so the
// provider (Deepgram today) can be swapped without touching orchestration.

export interface SttTranscript {
  isFinal: boolean
  speaker: number
  tStartMs: number
  tEndMs: number
  text: string
}

export interface SttSessionOptions {
  apiKey: string
  /** Glossary terms boosted for recognition (the sanas double-duty). */
  keyterms: string[]
  onTranscript: (t: SttTranscript) => void
  onError: (message: string) => void
}

export interface SttSession {
  /** 16 kHz mono linear16 PCM. */
  sendAudio(chunk: Buffer): void
  stop(): Promise<void>
}

export interface SttProvider {
  start(opts: SttSessionOptions): Promise<SttSession>
}
