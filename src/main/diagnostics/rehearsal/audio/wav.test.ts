import { CaptureTimingSession } from '../../../services/meetings/capture/timing/capture-session'
import { expect, it } from 'vitest'
import { audioFrame, readPcmWav, wavBytes } from './wav'

it('keeps mono/stereo sample identity and silences only Them at capture ingress', () => {
  const pcm = Buffer.alloc(1280)
  pcm.writeInt16LE(1234, 0)
  pcm.writeInt16LE(-5678, 2)
  const wav = readPcmWav(wavBytes(pcm, 2))
  expect(audioFrame(wav, 0, false).subarray(0, 4)).toEqual(pcm.subarray(0, 4))
  const silent = audioFrame(wav, 0, true)
  expect(silent.readInt16LE(0)).toBe(1234)
  expect(silent.readInt16LE(2)).toBe(0)
  expect(audioFrame(wav, 20, false).every((b) => b === 0)).toBe(true)
  expect(audioFrame(wav, 40, false).every((b) => b === 0)).toBe(true)
  expect(readPcmWav(wavBytes(Buffer.alloc(640), 1)).channels).toBe(1)
})
it('parses ancillary RIFF chunks and rejects corrupt, wrong-rate and compressed recordings', () => {
  const bytes = wavBytes(Buffer.alloc(640), 1)
  const junk = Buffer.from([74, 85, 78, 75, 2, 0, 0, 0, 1, 2])
  const extra = Buffer.concat([bytes.subarray(0, 12), junk, bytes.subarray(12)])
  extra.writeUInt32LE(extra.length - 8, 4)
  expect(readPcmWav(extra).pcm.length).toBe(640)
  expect(() => readPcmWav(bytes.subarray(0, -1))).toThrow('Truncated')
  const wrongRate = Buffer.from(bytes)
  wrongRate.writeUInt32LE(48000, 24)
  expect(() => readPcmWav(wrongRate)).toThrow('16 kHz')
  const compressed = Buffer.from(bytes)
  compressed.writeUInt16LE(3, 20)
  expect(() => readPcmWav(compressed)).toThrow('linear16')
})

it.each([1, 2] as const)(
  'bounds a known WAV speech endpoint with jitter for %i channels',
  (channels) => {
    const pcm = Buffer.alloc(6400 * channels * 2)
    // Known final nonzero sample: endpoint at sample 3200 (200 ms).
    for (let i = 0; i < 3200; i++) pcm.writeInt16LE(1000, i * channels * 2)
    const wav = readPcmWav(wavBytes(pcm, channels))
    expect(wav.pcm.readInt16LE(3199 * channels * 2)).toBe(1000)
    expect(wav.pcm.readInt16LE(3200 * channels * 2)).toBe(0)
    const timing = new CaptureTimingSession()
    timing.bind('wav', channels, 0)
    for (let i = 0; i < 20; i++) {
      timing.accept(
        {
          generation: 'wav',
          sequence: i,
          startFrame: i * 320,
          endFrame: (i + 1) * 320,
          sourceEndFrame: (i + 1) * 320,
          sourceRate: 16000,
          channels,
          pcm: Uint8Array.from(audioFrame(wav, i * 20, false)).buffer,
        },
        10000 + i * 20,
      )
      if (i === 4 || i === 14) {
        const p = timing.probe(10000 + (i + 1) * 20)!
        timing.reply(
          {
            ...p,
            outputFrame: (i + 1) * 320,
            sourceFrame: (i + 1) * 320,
            sourceRate: 16000,
            quantumFrames: 320,
          },
          10000 + (i + 1) * 20 + (i === 4 ? 5 : 80),
        )
      }
    }
    const result = timing.endpoint(200, 10400)
    expect(result.status).toBe('valid')
    if (result.status === 'valid') {
      expect(result.lowerMs).toBeLessThanOrEqual(10200)
      expect(result.upperMs).toBeGreaterThanOrEqual(10200)
      expect(result.upperMs - result.lowerMs).toBeGreaterThan(250)
    }
  },
)
