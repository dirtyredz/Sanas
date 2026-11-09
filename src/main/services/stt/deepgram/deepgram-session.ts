import { normalizeDeepgramMessage } from './deepgram-events'
import { buildStreamUrl } from './deepgram-stream-url'
import { ResultWatchdog } from './deepgram-watchdog'
import { PcmBacklog } from './recovery/pcm-backlog'
import type { SttSession, SttSessionOptions, SttSignal } from '../types'

// Deepgram streaming over Node's built-in WebSocket.
// Auth rides the Sec-WebSocket-Protocol header (['token', key]) since the
// browser-style WebSocket API can't set arbitrary headers.
//
// The session survives socket death: on an unexpected close, or when a socket stops
// returning Results while PCM keeps flowing (watchdog), it reconnects with backoff and keeps
// streaming. Continuity caveats (GOTCHAS.md):
//  - each connection's clock restarts at 0. Timestamps stay on the meeting's AUDIO clock by
//    counting every PCM byte once (including queued backoff audio) and freezing each
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

type RecoverReason = 'close' | 'stall' | 'send'

export class DeepgramSession implements SttSession {
  private ws: WebSocket | null = null // the installed, current socket
  private keepalive: ReturnType<typeof setInterval> | null = null
  private watchdog: ResultWatchdog | null = null
  private stopped = false
  private stopping: Promise<void> | null = null
  private recovering = false
  private backoffTimer: ReturnType<typeof setTimeout> | null = null
  private backoffResolve: (() => void) | null = null
  private warnedChannel = false
  private readonly startOffsetMs: number
  private bytesSeen = 0 // every PCM byte handed to us, sent or not
  private socketOffsetMs: number | null = null // frozen once the socket's first chunk is sent
  private readonly backlog: PcmBacklog
  private pumpTimer: ReturnType<typeof setTimeout> | null = null
  private cancelOpen: (() => void) | null = null
  private drainComplete: ((ok: boolean) => void) | null = null

  constructor(private opts: SttSessionOptions) {
    // a resumed meeting continues where its last session stopped
    this.startOffsetMs = opts.startOffsetMs ?? 0
    this.backlog = new PcmBacklog(30 * SAMPLE_RATE * BYTES_PER_SAMPLE * opts.channels)
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
      if (ws.readyState !== WebSocket.CLOSED) closeQuietly(ws) // never install
      return
    }
    this.install(ws)
    const drained = await new Promise<boolean>((resolve) => {
      this.drainComplete = resolve
      this.drain()
    })
    if (!this.stopped && (!drained || this.ws !== ws)) throw new Error(CONNECT_ERROR)
  }

  private waitForOpen(ws: WebSocket): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => fail(), OPEN_TIMEOUT_MS)
      this.cancelOpen = () => {
        settled = true
        clearTimeout(timer)
        closeQuietly(ws)
        resolve()
      }
      const fail = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.cancelOpen = null
        reject(new Error(CONNECT_ERROR))
      }
      ws.addEventListener(
        'open',
        () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          this.cancelOpen = null
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
      if (ws.readyState === WebSocket.OPEN && (ws.bufferedAmount ?? 0) < 256_000)
        this.sendGuarded(ws, JSON.stringify({ type: 'KeepAlive' }))
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
    if (this.stopped) return
    const old = this.ws
    if (!old) return
    this.ws = null // from here the old socket's events are ignored
    this.clearConnectionTimers()
    this.signal({ kind: 'reset' }) // continuity is gone now, not after the backoff
    if (reason !== 'close' && old)
      closeQuietly(old, 4000, reason === 'send' ? 'send failed' : 'stalled')
    // An initial replay failure belongs to the already-running recovery loop.
    if (this.recovering) return
    this.recovering = true

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
    const why = reason === 'stall' ? 'stalled' : reason === 'send' ? 'send failed' : `close ${code}`
    this.backlog.clear()
    this.stopped = true
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
    this.finishDrain(false)
    if (this.pumpTimer) clearTimeout(this.pumpTimer)
    this.pumpTimer = null
    if (this.keepalive) clearInterval(this.keepalive)
    this.keepalive = null
    this.watchdog?.stop()
    this.watchdog = null
  }

  /** A transport that throws synchronously from send() is treated like a dead socket: the
   *  throw is contained here (it would otherwise escape the keepalive timer or the IPC audio
   *  listener) and the connection recovers. Returns whether the frame was handed over. */
  private sendGuarded(ws: WebSocket, data: string | Buffer): boolean {
    try {
      ws.send(data)
      return true
    } catch {
      if (this.ws === ws) void this.recover('send')
      return false
    }
  }

  sendAudio(chunk: Buffer): void {
    if (this.stopped) return
    const before = this.bytesSeen
    this.bytesSeen += chunk.length
    if (!this.backlog.push(chunk, before)) {
      void this.stop()
      this.opts.onError('Deepgram audio buffer full (30 seconds) — pause and resume to reconnect.')
      return
    }
    if (!this.pumpTimer) this.drain()
  }

  /** Bounded handoffs and socket pressure; newer capture always joins the FIFO. */
  private drain(): void {
    const ws = this.ws
    if (this.stopped || !ws || ws.readyState !== WebSocket.OPEN) return
    let budget = 128_000
    let handoffs = 32
    while (this.backlog.peek() && budget > 0 && handoffs-- > 0) {
      const entry = this.backlog.peek()!
      if ((ws.bufferedAmount ?? 0) + entry.pcm.length > 256_000) break
      if (!this.sendGuarded(ws, entry.pcm)) return
      this.socketOffsetMs ??= this.cursorMs(entry.start)
      this.backlog.shift()
      budget -= entry.pcm.length
      this.watchdog?.audioSent()
    }
    if (this.backlog.peek())
      this.pumpTimer = setTimeout(() => {
        this.pumpTimer = null
        this.drain()
      }, 10)
    else this.finishDrain(true)
  }

  private finishDrain(ok: boolean): void {
    const complete = this.drainComplete
    this.drainComplete = null
    complete?.(ok)
  }

  stop(): Promise<void> {
    return (this.stopping ??= this.shutdown())
  }

  private async shutdown(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    this.backlog.clear()
    this.cancelOpen?.()
    this.cancelOpen = null
    this.clearConnectionTimers()
    if (this.backoffTimer) clearTimeout(this.backoffTimer)
    this.backoffTimer = null
    this.backoffResolve?.() // wake the recovery loop so it exits without reconnecting
    this.backoffResolve = null

    const ws = this.ws
    this.ws = null
    if (!ws) return
    if (ws.readyState !== WebSocket.OPEN) {
      closeQuietly(ws)
      return
    }
    try {
      ws.send(JSON.stringify({ type: 'CloseStream' }))
    } catch {
      closeQuietly(ws) // a transport that throws on send cannot flush; just close it
      return
    }
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
    closeQuietly(ws)
  }
}

function closeQuietly(ws: WebSocket, code?: number, reason?: string): void {
  try {
    ws.close(code, reason)
  } catch {
    // already closing or closed
  }
}
