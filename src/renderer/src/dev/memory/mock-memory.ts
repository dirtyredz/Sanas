import type { JobMemoryApi, JobMemoryView } from '@shared/jobs/memory'
import { jobs, meetings } from '../mock-fixtures'
const views = new Map<number, JobMemoryView>()
const source = meetings.find((m) => m.jobId === 1)
if (source)
  views.set(1, {
    eligible: true,
    approved: { text: 'Budget review every quarter.', revision: 1, updatedAt: source.startedAt },
    proposals: [
      {
        meetingId: source.id,
        jobId: 1,
        title: source.title,
        startedAt: source.startedAt,
        fingerprint: 'fixture',
        baseRevision: 1,
        generation: 'fixture-1',
        text: 'Budget review every quarter. Confirm the phase 2 timeline with Dana.',
        status: 'pending',
      },
    ],
  })
export function mockMemoryCounts(id: number): { memories: number; memoryProposals: number } {
  const v = views.get(id)
  return { memories: v?.approved.revision ? 1 : 0, memoryProposals: v?.proposals.length ?? 0 }
}
export function removeMockMemory(id: number): void {
  views.delete(id)
}
const get = (id: number): JobMemoryView =>
  structuredClone(
    views.get(id) ?? {
      approved: { text: '', revision: 0, updatedAt: null },
      proposals: [],
      eligible: jobs.find((j) => j.id === id)?.name !== 'Unsorted',
    },
  )
export const mockMemory: JobMemoryApi = {
  get: async (id) => get(id),
  save: async (id, revision, text) => {
    const v = get(id)
    if (v.approved.revision !== revision) throw new Error('Memory changed. Reload before saving.')
    if (text.length > 3000) throw new Error('Memory too long.')
    v.approved = { text, revision: revision + 1, updatedAt: new Date().toISOString() }
    v.proposals = v.proposals.map((p) => ({ ...p, status: 'stale' }))
    views.set(id, v)
    return get(id)
  },
  approve: async (id, review) => {
    const v = get(id),
      p = v.proposals.find((p) => p.meetingId === review.meetingId)
    if (
      !p ||
      p.generation !== review.generation ||
      p.baseRevision !== v.approved.revision ||
      p.status !== 'pending'
    )
      throw new Error('Proposal changed. Regenerate.')
    if (review.text.length > 3000) throw new Error('Memory too long.')
    v.approved = {
      text: review.text,
      revision: v.approved.revision + 1,
      updatedAt: new Date().toISOString(),
    }
    v.proposals = v.proposals
      .filter((p) => p.meetingId !== review.meetingId)
      .map((p) => ({ ...p, status: 'stale' }))
    views.set(id, v)
    return get(id)
  },
  dismiss: async (id, meetingId) => {
    const v = get(id)
    v.proposals = v.proposals.filter((p) => p.meetingId !== meetingId)
    views.set(id, v)
    return get(id)
  },
  retry: async (id, meetingId) => {
    const v = get(id)
    v.proposals = v.proposals.map((p) =>
      p.meetingId === meetingId
        ? {
            ...p,
            baseRevision: v.approved.revision,
            generation: `fixture-${Date.now()}`,
            status: 'pending',
          }
        : p,
    )
    views.set(id, v)
    return get(id)
  },
}
