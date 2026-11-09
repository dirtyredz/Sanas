import { parentPort, workerData } from 'node:worker_threads'
import { openReadOnlyConnection } from '../../../db/read-only'
import { liveHits } from './hits'
import { renderLiveHits } from './excerpts'
import type { RetrievalQuery, RetrievalReply } from './protocol'

const db = openReadOnlyConnection(workerData.path as string)
parentPort!.postMessage({ ready: true })
parentPort!.on('message', (q: RetrievalQuery) => {
  const start = performance.now()
  try {
    const hits = db.transaction(() => liveHits(db, q.jobId, q.meetingId, q.query))()
    parentPort!.postMessage({
      id: q.id,
      text: renderLiveHits(hits),
      snippets: hits.length,
      queryMs: performance.now() - start,
    } satisfies RetrievalReply)
  } catch {
    parentPort!.postMessage({
      id: q.id,
      text: '',
      snippets: 0,
      queryMs: performance.now() - start,
    } satisfies RetrievalReply)
  }
})
