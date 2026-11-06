import { readFileSync } from 'fs'
import { fitKeyterms } from './keyterm-budget'
import type {
  SttBatchOptions,
  SttBatchTranscript,
  SttProvider,
  SttSession,
  SttSessionOptions,
} from './types'
import { runText, splitBatchWords, type DeepgramWord } from './deepgram-events'
import { DeepgramSession } from './deepgram-session'

// Deepgram provider: live streaming (the socket lifecycle lives in deepgram-session.ts) and
// batch transcription of a finished recording.

export const deepgramProvider: SttProvider = {
  async start(opts: SttSessionOptions): Promise<SttSession> {
    const session = new DeepgramSession(opts)
    await session.connect()
    return session
  },

  async transcribeFile(wavPath: string, opts: SttBatchOptions): Promise<SttBatchTranscript[]> {
    const params = new URLSearchParams({
      model: 'nova-3',
      diarize: 'true',
      smart_format: 'true',
      multichannel: opts.channels > 1 ? 'true' : 'false',
    })
    for (const term of fitKeyterms(opts.keyterms)) params.append('keyterm', term)

    const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: 'POST',
      headers: { Authorization: `Token ${opts.apiKey}`, 'Content-Type': 'audio/wav' },
      body: new Uint8Array(readFileSync(wavPath)),
    })
    if (!res.ok) throw new Error(`Deepgram batch transcription failed (${res.status})`)
    const json = (await res.json()) as {
      results?: { channels?: { alternatives?: { words?: DeepgramWord[] }[] }[] }
    }

    const out: SttBatchTranscript[] = []
    const chans = json.results?.channels ?? []
    for (let channel = 0; channel < chans.length; channel++) {
      const words = chans[channel]?.alternatives?.[0]?.words ?? []
      for (const run of splitBatchWords(words)) {
        out.push({
          channel,
          speaker: run[0].speaker ?? -1,
          tStartMs: Math.round(run[0].start * 1000),
          tEndMs: Math.round(run[run.length - 1].end * 1000),
          text: runText(run),
        })
      }
    }
    return out.sort((a, b) => a.tStartMs - b.tStartMs)
  },
}
