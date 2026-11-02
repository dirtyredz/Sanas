import { createHash } from 'node:crypto'
import type { AssistRequest } from '../services/assistant/types'
import type { Step } from './scenario'
import { proseWords } from './semantics'

export const imageDigest = (base64: string): string =>
  createHash('sha256').update(Buffer.from(base64, 'base64')).digest('hex')
export interface RequestOutcome {
  id: number
  suggestionId?: number
  purpose: string
  manualKind?: string
  stepIds: string[]
  turnSpans: { startMs: number; endMs: number }[]
  atMs: number
  firstDeltaMs?: number
  firstVisibleMs?: number
  completedMs?: number
  deliveredMs?: number
  imageDigest?: string
  status: 'pending' | 'completed' | 'declined' | 'failed' | 'cancelled'
  pendingAtStop?: boolean
  answer: string
  proseWords?: number
  classifier?: string
}

export function turnSteps(
  steps: Step[],
  turns: readonly { startMs: number; endMs: number }[],
): string[] {
  return steps
    .filter(
      (s) =>
        s.kind === 'utterance' &&
        s.channel === 'them' &&
        turns.some((t) => s.atMs < t.endMs && s.atMs + s.durationMs > t.startMs),
    )
    .map((s) => s.id)
}

export function beginOutcome(
  id: number,
  req: AssistRequest,
  atMs: number,
  steps: Step[],
  action?: string,
): RequestOutcome {
  const turns = req.diagnostic?.turns ?? []
  return {
    id,
    suggestionId: req.diagnostic?.suggestionId,
    purpose: req.diagnostic?.purpose ?? 'summary',
    manualKind: req.diagnostic?.manualKind,
    stepIds: action ? [action] : turnSteps(steps, turns),
    turnSpans: turns.map((t) => ({ startMs: t.startMs, endMs: t.endMs })),
    atMs,
    status: 'pending',
    answer: '',
    imageDigest: req.image ? imageDigest(req.image.base64) : undefined,
  }
}

/** Public report contains timing, IDs and counts; synthetic text stays in private profile. */
export function publicOutcome(r: RequestOutcome): Omit<RequestOutcome, 'answer'> {
  const { answer, ...safe } = r
  return { ...safe, proseWords: r.purpose === 'classifier' ? undefined : proseWords(answer) }
}
