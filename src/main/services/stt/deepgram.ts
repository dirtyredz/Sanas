import type { SttProvider, SttSession, SttSessionOptions } from './types'

// Deepgram streaming over Node's built-in WebSocket.
// Auth rides the Sec-WebSocket-Protocol header (['token', key]) since the
// browser-style WebSocket API can't set arbitrary headers.

const WS_BASE = 'wss://api.deepgram.com/v1/listen'
const KEEPALIVE_MS = 5000 // socket dies after ~10s of silence (GOTCHAS.md)

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

export const deepgramProvider: SttProvider = {
  async start(opts: SttSessionOptions): Promise<SttSession> {
    const params = new URLSearchParams({
      model: 'nova-3',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      diarize: 'true',
      interim_results: 'true',
      smart_format: 'true'
    })
    // keyterm is repeatable — one per glossary term
    for (const term of opts.keyterms) params.append('keyterm', term)

    const ws = new WebSocket(`${WS_BASE}?${params}`, ['token', opts.apiKey])
    let closed = false

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true })
      ws.addEventListener(
        'error',
        () => reject(new Error('Deepgram connection failed — check API key/network')),
        { once: true }
      )
    })

    const keepalive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'KeepAlive' }))
    }, KEEPALIVE_MS)

    ws.addEventListener('message', (ev) => {
      let msg: {
        type?: string
        is_final?: boolean
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

      // TEMP debug: verify diarization fields are actually present (remove once confirmed)
      if (isFinal) {
        console.log(
          '[deepgram] final:',
          words.map((w) => `${w.word}@${w.speaker ?? '?'}`).join(' ')
        )
      }

      if (!isFinal || words.length === 0) {
        // interims are ephemeral — one line with the first word's speaker is fine
        opts.onTranscript({
          isFinal,
          speaker: words[0]?.speaker ?? -1,
          tStartMs: Math.round((words[0]?.start ?? 0) * 1000),
          tEndMs: Math.round((words[words.length - 1]?.end ?? 0) * 1000),
          text
        })
        return
      }

      // finals: one event per contiguous same-speaker run
      for (const run of splitBySpeaker(words)) {
        opts.onTranscript({
          isFinal: true,
          speaker: run[0].speaker ?? -1,
          tStartMs: Math.round(run[0].start * 1000),
          tEndMs: Math.round(run[run.length - 1].end * 1000),
          text: run.map((w) => w.punctuated_word ?? w.word).join(' ')
        })
      }
    })

    ws.addEventListener('close', (ev) => {
      clearInterval(keepalive)
      if (!closed && ev.code !== 1000) {
        opts.onError(`Deepgram socket closed unexpectedly (${ev.code})`)
      }
    })
    ws.addEventListener('error', () => {
      if (!closed) opts.onError('Deepgram socket error')
    })

    return {
      sendAudio(chunk: Buffer): void {
        if (ws.readyState === WebSocket.OPEN) ws.send(chunk)
      },
      async stop(): Promise<void> {
        closed = true
        clearInterval(keepalive)
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'CloseStream' }))
          await new Promise<void>((resolve) => {
            ws.addEventListener('close', () => resolve(), { once: true })
            setTimeout(resolve, 2000) // don't hang forever on a dead socket
          })
        }
      }
    }
  }
}
