export interface RetrievalQuery {
  id: number
  jobId: number
  meetingId: number
  query: string
}
export interface RetrievalReply {
  id: number
  text: string
  snippets: number
  queryMs: number
}
export interface FrozenEvidence {
  status: 'hit' | 'miss' | 'timeout' | 'failed' | 'cancelled' | 'skipped'
  waitMs: number
  schedulingMs: number
  queryMs: number
  snippets: number
  chars: number
}
