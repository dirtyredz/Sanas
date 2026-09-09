import { readFileSync } from 'fs'
import type {
  SttBatchOptions,
  SttBatchTranscript,
  SttProvider,
  SttSession,
  SttSessionOptions,
} from './types'

// Deepgram streaming over Node's built-in WebSocket.
// Auth rides the Sec-WebSocket-Protocol header (['token', key]) since the
// browser-style WebSocket API can't set arbitrary headers.
//
// The session survives socket death: on an unexpected close it reconnects with
// backoff and keeps streaming. Two continuity caveats (GOTCHAS.md):
//  - each connection's clock restarts at 0 → we add the previous connection's
//    last end-time as an offset so meeting timestamps stay monotonic;
//  - diarized speaker indices can reshuffle across connections.

const WS_BASE = 'wss://api.deepgram.com/v1/listen'
const KEEPALIVE_MS = 5000 // socket dies after ~10s of silence (GOTCHAS.md)
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 8000] // then give up

interface DeepgramWord {
  word: string
  punctuated_word?: string
  start: number
  end: number
  speaker?: number
}

/** Split a final result into contiguous same-speaker runs so one segment never
 *  flattens two voices into one label. */
function splitBySpeaker(words: DeepgramWord[]): DeepgramWord[][] {
  const runs: DeepgramWord[][] = []
  for (const w of words) {
    const last = runs[runs.length - 1]
    if (last && last[0].speaker === w.speaker) last.push(w)
    else runs.push([w])
  }
  return runs
}

function buildUrl(keyterms: string[], channels: number): string {
  const params = new URLSearchParams({
    model: 'nova-3',
    encoding: 'linear16',
    sample_rate: '16000',
    channels: String(channels),
    // stereo mode: transcribe each channel independently (mic vs loopback)
    multichannel: channels > 1 ? 'true' : 'false',
    diarize: 'true',
    interim_results: 'true',
    smart_format: 'true',
  })
  for (const term of keyterms) params.append('keyterm', term) // repeatable
  return `${WS_BASE}?${params}`
}

class DeepgramSession implements SttSession {
  private ws: WebSocket | null = null
  private keepalive: ReturnType<typeof setInterval> | null = null
  private stopped = false
  private offsetMs: number // added to this connection's clock, which starts at 0
  private lastEndMs: number // audio time reached, absolute within the meeting

  constructor(private opts: SttSessionOptions) {
    // a resumed meeting continues where its last session stopped
    this.offsetMs = opts.startOffsetMs ?? 0
    this.lastEndMs = this.offsetMs
  }

  elapsedMs(): number {
    return this.lastEndMs
  }

  async connect(): Promise<void> {
    const ws = new WebSocket(buildUrl(this.opts.keyterms, this.opts.channels), [
      'token',
      this.opts.apiKey,
    ])
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true })
      ws.addEventListener(
        'error',
        () => reject(new Error('Deepgram connection failed — check API key/network')),
        { once: true },
      )
    })
    this.ws = ws

    if (this.keepalive) clearInterval(this.keepalive)
    this.keepalive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'KeepAlive' }))
    }, KEEPALIVE_MS)

    ws.addEventListener('message', (ev) => this.handleMessage(ev))
    ws.addEventListener('close', (ev) => {
      if (this.stopped || ev.code === 1000) return
      void this.reconnect(ev.code)
    })
  }

  private handleMessage(ev: MessageEvent): void {
    let msg: {
      type?: string
      is_final?: boolean
      channel_index?: number[]
      channel?: { alternatives?: { transcript?: string; words?: DeepgramWord[] }[] }
    }
    try {
      msg = JSON.parse(String(ev.data))
    } catch {
      return
    }
    if (msg.type !== 'Results') return
    const alt = msg.channel?.alternatives?.[0]
    const text = alt?.transcript ?? ''
    if (!text) return
    const words = alt?.words ?? []
    const isFinal = msg.is_final === true
    const channel = msg.channel_index?.[0] ?? 0
    const t = (sec: number): number => Math.round(sec * 1000) + this.offsetMs

    if (!isFinal || words.length === 0) {
      // interims are ephemeral — one line with the first word's speaker is fine
      this.opts.onTranscript({
        isFinal,
        channel,
        speaker: words[0]?.speaker ?? -1,
        tStartMs: t(words[0]?.start ?? 0),
        tEndMs: t(words[words.length - 1]?.end ?? 0),
        text,
      })
      return
    }

    // finals: one event per contiguous same-speaker run
    for (const run of splitBySpeaker(words)) {
      const tEndMs = t(run[run.length - 1].end)
      this.lastEndMs = Math.max(this.lastEndMs, tEndMs)
      this.opts.onTranscript({
        isFinal: true,
        channel,
        speaker: run[0].speaker ?? -1,
        tStartMs: t(run[0].start),
        tEndMs,
        text: run.map((w) => w.punctuated_word ?? w.word).join(' '),
      })
    }
  }

  private async reconnect(closeCode: number): Promise<void> {
    // the next connection's clock restarts at 0; lastEndMs is absolute (and never
    // below the offset we started with, so a silent connection cannot rewind it)
    this.offsetMs = this.lastEndMs
    for (const delay of RECONNECT_DELAYS_MS) {
      if (this.stopped) return
      await new Promise((r) => setTimeout(r, delay))
      if (this.stopped) return
      try {
        await this.connect()
        console.log(`[deepgram] reconnected after close ${closeCode}`)
        return
      } catch {
        // next backoff step
      }
    }
    this.opts.onError(`Deepgram connection lost (close ${closeCode}) — reconnect failed`)
  }

  sendAudio(chunk: Buffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(chunk)
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.keepalive) clearInterval(this.keepalive)
    const ws = this.ws
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'CloseStream' }))
      await new Promise<void>((resolve) => {
        ws.addEventListener('close', () => resolve(), { once: true })
        setTimeout(resolve, 2000) // don't hang forever on a dead socket
      })
    }
  }
}

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
    for (const term of opts.keyterms) params.append('keyterm', term)

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
      for (const run of splitBySpeaker(words)) {
        out.push({
          channel,
          speaker: run[0].speaker ?? -1,
          tStartMs: Math.round(run[0].start * 1000),
          tEndMs: Math.round(run[run.length - 1].end * 1000),
          text: run.map((w) => w.punctuated_word ?? w.word).join(' '),
        })
      }
    }
    return out.sort((a, b) => a.tStartMs - b.tStartMs)
  },
}
