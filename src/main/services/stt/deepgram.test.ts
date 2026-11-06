import { describe, expect, it } from 'vitest'
import { buildStreamUrl } from './deepgram-stream-url'

// Socket lifecycle tests live in deepgram-session.test.ts; this covers the query we ask for.
describe('Deepgram streaming URL', () => {
  it('asks for endpointing, utterance ends and VAD events alongside the existing options', () => {
    const url = new URL(buildStreamUrl(['Sanas'], 1))
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      model: 'nova-3',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      diarize: 'true',
      interim_results: 'true',
      smart_format: 'true',
      multichannel: 'false',
      endpointing: '600',
      utterance_end_ms: '1000',
      vad_events: 'true',
      keyterm: 'Sanas',
    })
  })

  it('transcribes each channel independently in stereo', () => {
    const url = new URL(buildStreamUrl([], 2))
    expect(url.searchParams.get('channels')).toBe('2')
    expect(url.searchParams.get('multichannel')).toBe('true')
  })
})
