import { randomUUID } from 'node:crypto'
import type { MemoryProposal } from '@shared/jobs/memory'
import { loadSettings } from '../../../config/settings'
import { getApprovedMemory, validateMemory } from '../../../db/repos/job/memory/approved'
import { getProposal, settleProposal, startProposal } from '../../../db/repos/job/memory/proposals'
import { assistantProvider } from '../../assistant/provider'
import { whilePostProcessing } from '../../meetings/status/post-processing'
import { MEMORY_SYSTEM, memoryRewriteInput } from './prompts'
import { memorySource, proposalIsCurrent, type MemorySource } from './source'

/** Skips an unchanged, non-stale source unless retrying; otherwise starts a new generation
 *  against the last approved revision. */
function beginProposal(source: MemorySource, retry: boolean): MemoryProposal | null {
  const old = getProposal(source.meetingId)
  if (!retry && old?.fingerprint === source.fingerprint && old.status !== 'stale') return null
  return startProposal(source, getApprovedMemory(source.jobId).revision, randomUUID())
}
/** Stale if the source or approved base moved meanwhile, failed when no text came back. */
function finishProposal(p: MemoryProposal, text: string | null): void {
  if (text !== null) validateMemory(text)
  const status = !proposalIsCurrent(p) ? 'stale' : text === null ? 'failed' : 'pending'
  settleProposal(p.meetingId, p.generation, text ?? '', status)
}

const queues = new Map<number, Promise<void>>()
const active = new Map<number, number>()
export function generatingMemory(meetingId: number): boolean {
  return active.has(meetingId)
}
/** Holds the source even while queued; each job rewrites against the last approved revision. */
export function generateMemory(meetingId: number, retry = false): Promise<void> {
  const source = memorySource(meetingId)
  if (!source) return Promise.resolve()
  const previous = queues.get(source.jobId) ?? Promise.resolve()
  active.set(meetingId, (active.get(meetingId) ?? 0) + 1)
  const work = whilePostProcessing(meetingId, async () => {
    await previous.catch(() => {})
    const current = memorySource(meetingId)
    if (!current || current.jobId !== source.jobId) return
    const proposal = beginProposal(current, retry)
    if (!proposal) return
    try {
      const s = loadSettings()
      if (!s.anthropicApiKey) throw new Error('Missing key')
      const text = await assistantProvider.complete({
        apiKey: s.anthropicApiKey,
        workspaceId: s.anthropicWorkspaceId || undefined,
        model: s.answerModel,
        system: MEMORY_SYSTEM,
        userContent: memoryRewriteInput(getApprovedMemory(source.jobId).text, current),
        maxTokens: 1600,
        effort: 'medium',
        timeoutMs: 30_000,
      })
      finishProposal(proposal, text.trim())
    } catch {
      finishProposal(proposal, null)
    }
  })
  queues.set(source.jobId, work)
  void work
    .finally(() => {
      const n = (active.get(meetingId) ?? 1) - 1
      if (n) active.set(meetingId, n)
      else active.delete(meetingId)
      if (queues.get(source.jobId) === work) queues.delete(source.jobId)
    })
    .catch(() => {})
  return work
}
/** Summary completion/email must never depend on the background rewrite. */
export function enqueueMemory(meetingId: number): void {
  try {
    void generateMemory(meetingId).catch(() => {})
  } catch {
    /* summary still succeeds */
  }
}
