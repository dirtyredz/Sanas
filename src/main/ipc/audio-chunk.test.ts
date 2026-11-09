import { expect, it, vi } from 'vitest'
import { createAudioChunkListener } from './audio-chunk'

it('forwards ArrayBuffer chunks and drops anything else', () => {
  const sink = vi.fn()
  const listener = createAudioChunkListener(sink)
  listener({}, new Uint8Array([1, 2]).buffer)
  listener({}, 'nope')
  expect(sink).toHaveBeenCalledOnce()
  expect(sink.mock.calls[0][0]).toEqual(Buffer.from([1, 2]))
})

it('contains a throwing sink and logs once per failing run', () => {
  const sink = vi.fn(() => {
    throw new Error('write after end')
  })
  const warn = vi.fn()
  const listener = createAudioChunkListener(sink, warn)
  const chunk = new ArrayBuffer(2)
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
