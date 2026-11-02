import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: fake.spawn }))
import { speakWindows } from './speech'

function child() {
  const c = Object.assign(new EventEmitter(), {
    stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
    kill: vi.fn(),
  })
  fake.spawn.mockReturnValue(c)
  return c
}
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})
it('sends literal speech over stdin and awaits default-device playback exit', async () => {
  const c = child(),
    text = "Say 'hello'; $(do-not-run)"
  const work = speakWindows('speech.ps1', text, new AbortController().signal)
  expect(c.stdin.end).toHaveBeenCalledWith(Buffer.from(text).toString('base64'))
  expect(JSON.stringify(fake.spawn.mock.calls)).not.toContain(text)
  expect(fake.spawn.mock.calls[0][2]).toMatchObject({ windowsHide: true })
  c.emit('close', 0)
  await work
})
it('cancellation kills only its child and waits for close', async () => {
  const c = child(),
    controller = new AbortController()
  let done = false
  const work = speakWindows('speech.ps1', 'hello', controller.signal).then(() => {
    done = true
  })
  controller.abort()
  await Promise.resolve()
  expect(c.kill).toHaveBeenCalledOnce()
  expect(done).toBe(false)
  c.emit('close', 1)
  await work
})
it('bounds a stuck child and reports synthesis failure', async () => {
  vi.useFakeTimers()
  const c = child()
  const work = speakWindows('speech.ps1', 'hello', new AbortController().signal)
  const failed = expect(work).rejects.toThrow('playback failed')
  await vi.advanceTimersByTimeAsync(60000)
  expect(c.kill).toHaveBeenCalledOnce()
  c.emit('close', 1)
  await failed
  expect(vi.getTimerCount()).toBe(0)
})
