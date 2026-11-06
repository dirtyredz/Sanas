import { ENDPOINTING_MS } from './endpointing'
import { fitKeyterms } from './keyterm-budget'

const WS_BASE = 'wss://api.deepgram.com/v1/listen'

/** Streaming query. Endpointing and utterance-end give turn assembly its boundary evidence;
 *  VAD events give it speech activity. */
export function buildStreamUrl(keyterms: string[], channels: number): string {
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
    endpointing: String(ENDPOINTING_MS),
    utterance_end_ms: '1000',
    vad_events: 'true',
  })
  for (const term of fitKeyterms(keyterms)) params.append('keyterm', term) // repeatable
  return `${WS_BASE}?${params}`
}
