export const JOB_MEMORY_MAX_CHARS = 3_000

export interface ApprovedMemory {
  text: string
  revision: number
  updatedAt: string | null
}
export interface MemoryProposal {
  meetingId: number
  jobId: number
  title: string
  startedAt: string
  fingerprint: string
  baseRevision: number
  generation: string
  text: string
  status: 'pending' | 'generating' | 'failed' | 'stale' | 'approved' | 'dismissed'
}
export interface JobMemoryView {
  approved: ApprovedMemory
  proposals: MemoryProposal[]
  eligible: boolean
}
export interface MemoryReview {
  meetingId: number
  generation: string
  revision: number
  text: string
}
export interface JobMemoryApi {
  get(jobId: number): Promise<JobMemoryView>
  save(jobId: number, revision: number, text: string): Promise<JobMemoryView>
  approve(jobId: number, review: MemoryReview): Promise<JobMemoryView>
  dismiss(jobId: number, meetingId: number, generation: string): Promise<JobMemoryView>
  retry(jobId: number, meetingId: number): Promise<JobMemoryView>
}
