import { afterEach, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({
  workers: [] as {
    handlers: Record<string, (v?: unknown) => void>
    postMessage: ReturnType<typeof vi.fn>
    terminate: ReturnType<typeof vi.fn>
  }[],
}))
vi.mock('node:worker_threads', () => ({
  Worker: class {
    handlers: Record<string, (v?: unknown) => void> = {}
    postMessage = vi.fn()
    terminate = vi.fn(async () => 0)
    constructor() {
      f.workers.push(this)
    }
    on(name: string, fn: (v?: unknown) => void) {
      this.handlers[name] = fn
    }
  },
}))
import { HistoryWorker } from './worker-client'
afterEach(() => {
  f.workers = []
  vi.useRealTimers()
})
it('bounds the queue, matches replies, recycles stalls and disposes pending work', async () => {
  vi.useFakeTimers()
  const c = new HistoryWorker('fixture.db'),
    q = { meetingId: 2, jobId: 1, query: 'Atlas' }
  c.start()
  f.workers[0].handlers.message({ ready: true })
  const first = c.query(q)
  expect(await c.query(q)).toBeNull()
  const w = f.workers[0],
    id = w.postMessage.mock.calls[0][0].id
  w.handlers.message({ id: id + 1, text: 'obsolete' })
  w.handlers.message({ id, text: 'hit', snippets: 1, queryMs: 1 })
  expect((await first)?.text).toBe('hit')
  const stalled = c.query(q)
  await vi.advanceTimersByTimeAsync(250)
  expect(await stalled).toBeNull()
  expect(w.terminate).toHaveBeenCalled()
  const next = c.query(q)
  expect(f.workers).toHaveLength(2)
  c.dispose()
  expect(await next).toBeNull()
})
it('worker errors degrade to empty evidence', async () => {
  const c = new HistoryWorker('missing.db')
  const p = c.query({ meetingId: 2, jobId: 1, query: 'Atlas' })
  f.workers[0].handlers.error()
  expect(await p).toBeNull()
  c.dispose()
})
