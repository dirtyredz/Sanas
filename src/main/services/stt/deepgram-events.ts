import type { SttSignal, SttTranscript } from './types'

// Pure interpretation of Deepgram streaming messages, kept apart from the socket adapter so
// the protocol rules can be tested without a network:
//  - every final speaker run of a Results message is delivered BEFORE that message's
//    boundary, so a turn has its last words when its endpoint arrives;
//  - an empty `speech_final` still carries an endpoint and is not discarded;
//  - Results name their channel in `channel_index`, UtteranceEnd/SpeechStarted in `channel`;
//  - a multichannel message that does not say which channel it is gets channel -1 (identity
//    unknown) rather than silently becoming channel 0, which in stereo means "the user";
//  - malformed input yields nothing; this runs inside a socket listener and must not throw.

export interface DeepgramWord {
  word: string
  punctuated_word?: string
  start: number
  end: number
  speaker?: number
}

export type DeepgramEvent =
  { type: 'transcript'; transcript: SttTranscript } | { type: 'signal'; signal: SttSignal }

export interface NormalizeContext {
  /** Channels the session was opened with (1 = mono, 2 = mic + loopback). */
  channels: number
  /** Added to the connection's clock, which restarts at zero per socket. */
  offsetMs: number
}

export interface NormalizedMessage {
  events: DeepgramEvent[]
  /** Latest absolute end time of a FINAL word in this message, if any (reconnect offset). */
  finalEndMs: number | null
  /** Set when a multichannel message had no usable channel index (diagnostic only). */
  invalidChannel: boolean
}

const EMPTY: NormalizedMessage = { events: [], finalEndMs: null, invalidChannel: false }

/** Split a final result into contiguous same-speaker runs so one segment never
 *  flattens two voices into one label. */
export function splitBySpeaker(words: DeepgramWord[]): DeepgramWord[][] {
  const runs: DeepgramWord[][] = []
  for (const w of words) {
    const last = runs[runs.length - 1]
    if (last && last[0].speaker === w.speaker) last.push(w)
    else runs.push([w])
  }
  return runs
}

export function runText(run: DeepgramWord[]): string {
  return run.map((w) => w.punctuated_word ?? w.word).join(' ')
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function isWord(w: unknown): w is DeepgramWord {
  if (typeof w !== 'object' || w === null) return false
  const o = w as Record<string, unknown>
  return typeof o.word === 'string' && finite(o.start) && finite(o.end)
}

/** Channel from a `[index, total]` array. Mono may omit it (there is only channel 0); a
 *  multichannel message without a valid index is unknown (-1). */
function channelOf(raw: unknown, channels: number): { channel: number; invalid: boolean } {
  const index = Array.isArray(raw) ? raw[0] : undefined
  if (Number.isInteger(index) && (index as number) >= 0 && (index as number) < channels) {
    return { channel: index as number, invalid: false }
  }
  if (channels <= 1) return { channel: 0, invalid: raw !== undefined }
  return { channel: -1, invalid: true }
}

export function normalizeDeepgramMessage(data: string, ctx: NormalizeContext): NormalizedMessage {
  let msg: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(data)
    if (typeof parsed !== 'object' || parsed === null) return EMPTY
    msg = parsed as Record<string, unknown>
  } catch {
    return EMPTY
  }
  const t = (sec: number): number => Math.round(sec * 1000) + ctx.offsetMs

  if (msg.type === 'UtteranceEnd') {
    // -1 means "no word yet on this connection": not a usable boundary
    const lastWordEnd = msg.last_word_end
    if (!finite(lastWordEnd) || lastWordEnd < 0) return EMPTY
    const { channel, invalid } = channelOf(msg.channel, ctx.channels)
    return {
      events: [
        {
          type: 'signal',
          signal: { kind: 'boundary', channel, atMs: t(lastWordEnd), source: 'utterance-end' },
        },
      ],
      finalEndMs: null,
      invalidChannel: invalid,
    }
  }

  if (msg.type === 'SpeechStarted') {
    if (!finite(msg.timestamp) || msg.timestamp < 0) return EMPTY
    const { channel, invalid } = channelOf(msg.channel, ctx.channels)
    return {
      events: [{ type: 'signal', signal: { kind: 'activity', channel, atMs: t(msg.timestamp) } }],
      finalEndMs: null,
      invalidChannel: invalid,
    }
  }

  if (msg.type !== 'Results') return EMPTY
  const { channel, invalid } = channelOf(msg.channel_index, ctx.channels)
  const body = msg.channel as { alternatives?: unknown } | undefined
  const alts = Array.isArray(body?.alternatives) ? body.alternatives : []
  const alt = (alts[0] ?? {}) as { transcript?: unknown; words?: unknown }
  const text = typeof alt.transcript === 'string' ? alt.transcript : ''
  const words = Array.isArray(alt.words) ? alt.words.filter(isWord) : []
  const isFinal = msg.is_final === true
  const speechFinal = msg.speech_final === true
  const resultStart = finite(msg.start) && msg.start >= 0 ? msg.start : null
  const resultDuration = finite(msg.duration) && msg.duration >= 0 ? msg.duration : null
  const resultEnd =
    resultStart !== null && resultDuration !== null ? resultStart + resultDuration : null

  const events: DeepgramEvent[] = []
  let finalEndMs: number | null = null

  if (text) {
    if (!isFinal) {
      // interims are ephemeral: one line with the first word's speaker is fine
      const tStartMs = t(words[0]?.start ?? resultStart ?? 0)
      const tEndMs = t(words[words.length - 1]?.end ?? resultEnd ?? 0)
      events.push({
        type: 'transcript',
        transcript: { isFinal, channel, speaker: words[0]?.speaker ?? -1, tStartMs, tEndMs, text },
      })
      events.push({ type: 'signal', signal: { kind: 'activity', channel, atMs: tEndMs } })
    } else if (words.length === 0) {
      // a wordless final: result-level timing where valid, speaker unknown
      const tEndMs = resultEnd !== null ? t(resultEnd) : t(0)
      events.push({
        type: 'transcript',
        transcript: {
          isFinal: true,
          channel,
          speaker: -1,
          tStartMs: resultStart !== null ? t(resultStart) : t(0),
          tEndMs,
          text,
        },
      })
      if (resultEnd !== null) finalEndMs = tEndMs
    } else {
      for (const run of splitBySpeaker(words)) {
        const tEndMs = t(run[run.length - 1].end)
        finalEndMs = Math.max(finalEndMs ?? tEndMs, tEndMs)
        events.push({
          type: 'transcript',
          transcript: {
            isFinal: true,
            channel,
            speaker: run[0].speaker ?? -1,
            tStartMs: t(run[0].start),
            tEndMs,
            text: runText(run),
          },
        })
      }
    }
  }

  if (isFinal && speechFinal) {
    const at = words.length > 0 ? words[words.length - 1].end : resultEnd
    if (at !== null) {
      events.push({
        type: 'signal',
        signal: { kind: 'boundary', channel, atMs: t(at), source: 'endpoint' },
      })
    }
  }

  return { events, finalEndMs, invalidChannel: invalid && events.length > 0 }
}
