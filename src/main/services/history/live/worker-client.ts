import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import type { RetrievalQuery, RetrievalReply } from './protocol'

/** One in-flight query, no unbounded message queue. Timeouts recycle a stalled worker. */
export class HistoryWorker {
  private worker: Worker | null = null
  private pending: {
    id: number
    resolve: (r: RetrievalReply | null) => void
    timer: ReturnType<typeof setTimeout>
  } | null = null
  private seq = 0
  private ready = false
  private retiring: Promise<void> | null = null
  private startup: ReturnType<typeof setTimeout> | undefined
  isReady(): boolean {
    return this.ready
  }
  constructor(private path: string) {}
  start(): void {
    if (this.worker || this.retiring) return
    try {
      const worker = (this.worker = new Worker(join(__dirname, '../history-worker.js'), {
        workerData: { path: this.path },
      }))
      this.startup = setTimeout(() => this.dispose(), 2000)
      worker.on('message', (r: RetrievalReply | { ready: true }) => {
        if (this.worker !== worker) return
        if ('ready' in r) {
          this.ready = true
          clearTimeout(this.startup)
          this.startup = undefined
          return
        }
        if (this.pending?.id === r.id) {
          clearTimeout(this.pending.timer)
          this.pending.resolve(r)
          this.pending = null
        }
      })
      worker.on('error', () => {
        if (this.worker === worker) this.dispose()
      })
      worker.on('exit', () => {
        if (this.worker === worker) this.dispose()
      })
    } catch {
      this.dispose()
    }
  }
  query(q: Omit<RetrievalQuery, 'id'>): Promise<RetrievalReply | null> {
    this.start()
    if (!this.worker || !this.ready || this.pending) return Promise.resolve(null)
    return new Promise((resolve) => {
      const id = ++this.seq
      const timer = setTimeout(() => this.dispose(), 250)
      this.pending = { id, resolve, timer }
      try {
        this.worker!.postMessage({ ...q, id })
      } catch {
        this.dispose()
      }
    })
  }
  dispose(): void {
    const worker = this.worker
    this.worker = null
    this.ready = false
    clearTimeout(this.startup)
    this.startup = undefined
    if (this.pending) {
      clearTimeout(this.pending.timer)
      this.pending.resolve(null)
      this.pending = null
    }
    // Native SQLite may finish its current query before termination settles. Do not
    // accumulate replacement workers while that previous read is still running.
    if (worker) {
      this.retiring = worker
        .terminate()
        .then(
          () => {},
          () => {},
        )
        .finally(() => {
          this.retiring = null
        })
    }
  }
  async close(): Promise<void> {
    this.dispose()
    await this.retiring
  }
}
let worker: HistoryWorker | null = null
export function historyWorker(path: string): HistoryWorker {
  return (worker ??= new HistoryWorker(path))
}
export function stopHistoryWorker(): void {
  worker?.dispose()
  worker = null
}
