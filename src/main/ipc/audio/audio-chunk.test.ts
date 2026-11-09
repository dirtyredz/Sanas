import { expect, it, vi } from 'vitest'
import { createAudioChunkListener } from './audio-chunk'
const frame = () => ({
  generation: 'g',
  sequence: 0,
  startFrame: 0,
  endFrame: 1,
  sourceEndFrame: 2,
  sourceRate: 16000,
  channels: 1,
  pcm: new Uint8Array([1, 2]).buffer,
})

it('forwards validated capture envelopes and drops bare PCM', () => {
  const sink = vi.fn()
  const listener = createAudioChunkListener(sink)
  listener({}, frame())
  listener({}, new ArrayBuffer(2))
  listener({}, 'nope')
  expect(sink).toHaveBeenCalledOnce()
  expect(sink.mock.calls[0][0]).toEqual(frame())
  expect(sink.mock.calls[0][1]).toBeTypeOf('number')
})

it('contains a throwing sink and logs once per failing run', () => {
  const sink = vi.fn((): void => {
    throw new Error('write after end')
  })
  const warn = vi.fn()
  const listener = createAudioChunkListener(sink, warn)
  const chunk = frame()
  expect(() => {
    listener({}, chunk)
    listener({}, chunk)
  }).not.toThrow()
  expect(warn).toHaveBeenCalledOnce()
  sink.mockImplementationOnce(() => undefined)
  listener({}, chunk)
  listener({}, chunk)
  expect(warn).toHaveBeenCalledTimes(2)
})
