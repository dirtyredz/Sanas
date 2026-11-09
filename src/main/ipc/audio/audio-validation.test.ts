import { expect, it } from 'vitest'
import { isCaptureFrame, isCaptureReply } from './audio-validation'

const frame = {
  generation: 'g',
  sequence: 0,
  startFrame: 0,
  endFrame: 1600,
  sourceEndFrame: 4800,
  sourceRate: 48000,
  channels: 2,
  pcm: new ArrayBuffer(6400),
}
it('validates frame alignment, positions, rates, channels and bounded payloads', () => {
  expect(isCaptureFrame(frame)).toBe(true)
  for (const patch of [
    { generation: '' },
    { sequence: -1 },
    { startFrame: 0.5 },
    { endFrame: Infinity },
    { sourceRate: 0 },
    { sourceEndFrame: 100 },
    { channels: 3 },
    { pcm: new ArrayBuffer(6399) },
    { pcm: new ArrayBuffer(100000) },
  ])
    expect(isCaptureFrame({ ...frame, ...patch })).toBe(false)
})
it('requires bounded integer probe/sample fields', () => {
  const reply = {
    generation: 'g',
    nonce: 1,
    outputFrame: 1600,
    sourceFrame: 4800,
    sourceRate: 48000,
    quantumFrames: 128,
  }
  expect(isCaptureReply(reply)).toBe(true)
  for (const patch of [
    { nonce: NaN },
    { sourceFrame: -1 },
    { quantumFrames: 0 },
    { quantumFrames: 2049 },
  ])
    expect(isCaptureReply({ ...reply, ...patch })).toBe(false)
})
