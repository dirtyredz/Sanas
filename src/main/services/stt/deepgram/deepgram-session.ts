import { normalizeDeepgramMessage } from './deepgram-events'
import { buildStreamUrl } from './deepgram-stream-url'
import { ResultWatchdog } from './deepgram-watchdog'
import type { SttSession, SttSessionOptions, SttSignal } from '../types'

// Deepgram streaming over Node's built-in WebSocket.
// Auth rides the Sec-WebSocket-Protocol header (['token', key]) since the
// browser-style WebSocket API can't set arbitrary headers.
//
// The session survives socket death: on an unexpected close, or when a socket stops
// returning Results while PCM keeps flowing (watchdog), it reconnects with backoff and keeps
// streaming. Continuity caveats (GOTCHAS.md):
//  - each connection's clock restarts at 0. Timestamps stay on the meeting's AUDIO clock by
//    counting every PCM byte we are handed (sent or dropped during backoff) and freezing each
//    socket's offset at the cursor where its first chunk started. Offsets follow PCM, never the
//    last final, never wall time;
//  - diarized speaker indices can reshuffle across connections;
//  - a lost connection reports ONE `reset` at once (before the backoff), and anything a retired
//    socket still delivers is ignored, so a half-assembled turn never completes from it.
//
// Message interpretation (speaker runs, boundaries, channels) lives in deepgram-events.ts.

const KEEPALIVE_MS = 5000 // socket dies after ~10s of silence (GOTCHAS.md)
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 8000] // then give up
const OPEN_TIMEOUT_MS = 10_000
const STOP_CLOSE_WAIT_MS = 2000
const SAMPLE_RATE = 16000
const BYTES_PER_SAMPLE = 2
const CONNECT_ERROR = 'Deepgram connection failed — check API key/network'

type RecoverReason = 'close' | 'stall'

export class DeepgramSession implements SttSession {
  private ws: WebSocket | null = null // the installed, current socket
  private keepalive: ReturnType<typeof setInterval> | null = null
  private watchdog: ResultWatchdog | null = null
  private stopped = false
  private recovering = false
  private backoffTimer: ReturnType<typeof setTimeout> | null = null
  private backoffResolve: (() => void) | null = null
  private warnedChannel = false
  private readonly startOffsetMs: number
  private bytesSeen = 0 // every PCM byte handed to us, sent or not
  private socketOffsetMs: number | null = null // frozen once the socket's first chunk is sent

  constructor(private opts: SttSessionOptions) {
    // a resumed meeting continues where its last session stopped
    this.startOffsetMs = opts.startOffsetMs ?? 0
  }

  /** Meeting audio time at a byte position. Never rounded per chunk. */
  private cursorMs(bytes: number): number {
    const frameBytes = BYTES_PER_SAMPLE * this.opts.channels
    return this.startOffsetMs + (bytes * 1000) / (frameBytes * SAMPLE_RATE)
  }

  async connect(): Promise<void> {
    const ws = new WebSocket(buildStreamUrl(this.opts.keyterms, this.opts.channels), [
      'token',
      this.opts.apiKey,
    ])
    try {
      await this.waitForOpen(ws)
    } catch (e) {
      closeQuietly(ws)
      throw e
    }
    if (this.stopped) {
      closeQuietly(ws) // Stop landed while opening: never install
      return
    }
    this.install(ws)
  }

  private waitForOpen(ws: WebSocket): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(CONNECT_ERROR)), OPEN_TIMEOUT_MS)
      const fail = (): void => {
        clearTimeout(timer)
        reject(new Error(CONNECT_ERROR))
      }
      ws.addEventListener(
        'open',
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true },
      )
      ws.addEventListener('error', fail, { once: true })
      ws.addEventListener('close', fail, { once: true })
    })
  }

  private install(ws: WebSocket): void {
    this.ws = ws
    this.socketOffsetMs = null
    this.keepalive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'KeepAlive' }))
    }, KEEPALIVE_MS)
    this.watchdog = new ResultWatchdog({
      now: () => Date.now(),
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
      onStall: () => {
        if (this.ws === ws) void this.recover('stall')
      },
    })
    // a socket that is no longer the current one is retired: its callbacks are ignored
    ws.addEventListener('message', (ev) => {
      if (this.ws === ws) this.handleMessage(ev)
    })
    ws.addEventListener('close', (ev) => {
      if (this.ws !== ws || this.stopped || ev.code === 1000) return
      void this.recover('close', ev.code)
    })
  }

  private signal(s: SttSignal): void {
    try {
      this.opts.onSignal?.(s)
    } catch (e) {
      console.warn('[deepgram] signal handler failed:', e)
    }
  }

  private handleMessage(ev: MessageEvent): void {
    // an exception escaping a socket listener ends the main process
    try {
      const out = normalizeDeepgramMessage(String(ev.data), {
        channels: this.opts.channels,
        // before the first chunk is sent the cursor is the best (provisional) offset
        offsetMs: this.socketOffsetMs ?? this.cursorMs(this.bytesSeen),
      })
      if (out.results) this.watchdog?.results()
      if (out.invalidChannel && !this.warnedChannel) {
        this.warnedChannel = true // once per session: a diagnostic, not a log flood
        console.warn('[deepgram] multichannel message without a valid channel index')
      }
      for (const e of out.events) {
        if (e.type === 'transcript') this.opts.onTranscript(e.transcript)
        else this.signal(e.signal)
      }
    } catch (e) {
      console.warn('[deepgram] could not handle a message:', e)
    }
  }

  /** The one way a lost connection is handled: retire it, report one reset, reconnect. */
  private async recover(reason: RecoverReason, code?: number): Promise<void> {
    if (this.stopped || this.recovering) return
    this.recovering = true
    const old = this.ws
    this.ws = null // from here the old socket's events are ignored
    this.clearConnectionTimers()
    this.signal({ kind: 'reset' }) // continuity is gone now, not after the backoff
    if (reason === 'stall' && old) closeQuietly(old, 4000, 'stalled')

    for (const delay of RECONNECT_DELAYS_MS) {
      if (this.stopped) return
      await this.sleep(delay)
      if (this.stopped) return
      try {
        await this.connect()
      } catch {
        continue // next backoff step
      }
      if (this.stopped) return
      console.log(`[deepgram] reconnected after ${reason}`)
      this.recovering = false
      return
    }
    this.recovering = false
    if (this.stopped) return
    const why = reason === 'stall' ? 'stalled' : `close ${code}`
    this.opts.onError(`Deepgram connection lost (${why}) — reconnect failed`)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.backoffResolve = resolve
      this.backoffTimer = setTimeout(() => {
        this.backoffTimer = null
        this.backoffResolve = null
        resolve()
      }, ms)
    })
  }

  private clearConnectionTimers(): void {
    if (this.keepalive) clearInterval(this.keepalive)
    this.keepalive = null
    this.watchdog?.stop()
    this.watchdog = null
  }

  sendAudio(chunk: Buffer): void {
    const before = this.bytesSeen
    this.bytesSeen += chunk.length // the recording clock counts audio we had to drop too
    const ws = this.ws
    if (this.stopped || !ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(chunk)
    this.socketOffsetMs ??= this.cursorMs(before)
    this.watchdog?.audioSent()
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    this.clearConnectionTimers()
    if (this.backoffTimer) clearTimeout(this.backoffTimer)
    this.backoffTimer = null
    this.backoffResolve?.() // wake the recovery loop so it exits without reconnecting
    this.backoffResolve = null

    const ws = this.ws
    if (!ws) return
    if (ws.readyState !== WebSocket.OPEN) {
      closeQuietly(ws)
      return
    }
    ws.send(JSON.stringify({ type: 'CloseStream' }))
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, STOP_CLOSE_WAIT_MS) // don't hang forever on a dead socket
      ws.addEventListener(
        'close',
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true },
      )
    })
  }
}

function closeQuietly(ws: WebSocket, code?: number, reason?: string): void {
  try {
    ws.close(code, reason)
  } catch {
    // already closing or closed
  }
}
