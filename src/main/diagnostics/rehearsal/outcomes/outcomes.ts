import { createHash } from 'node:crypto'
import type { AssistRequest } from '../../../services/assistant/types'
import type { Step } from '../scenario/scenario'
import type { RequestOutcome } from '../../request-outcome'

export const imageDigest = (base64: string): string =>
  createHash('sha256').update(Buffer.from(base64, 'base64')).digest('hex')
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
