import type { FrozenEvidence, RetrievalReply } from './protocol'

/** Structurally satisfies the consumer-owned EvidenceHandle in meetings/assist/live-assistance. */
export interface FrozenEvidenceHandle {
  ready: Promise<string>
  cancel(): void
}
/** Freezes exactly once. Late worker results cannot mutate comparable answer requests. */
export function freezeEvidence(
  query: () => Promise<RetrievalReply | null>,
  budget: number,
  signal?: AbortSignal,
  report: (e: FrozenEvidence) => void = () => {},
  clock: () => number = () => performance.now(),
): FrozenEvidenceHandle {
  const start = clock()
  let finish: (status: FrozenEvidence['status'], reply?: RetrievalReply | null) => void = () => {}
  const ready = new Promise<string>((resolve) => {
    let settled = false
    const cancel = (): void => finish('cancelled')
    const timer = setTimeout(() => finish('timeout'), budget)
    finish = (status, reply) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      const elapsed = clock() - start
      if (reply && elapsed > budget) {
        status = 'timeout'
        reply = null
      }
      const text = reply?.text ?? ''
      try {
        report({
          status,
          waitMs: Math.min(elapsed, budget),
          schedulingMs: Math.max(0, elapsed - budget),
          queryMs: reply?.queryMs ?? 0,
          snippets: reply?.snippets ?? 0,
          chars: text.length,
        })
      } catch {
        /* observation only */
      }
      resolve(text)
    }
    signal?.addEventListener('abort', cancel, { once: true })
    if (signal?.aborted) {
      cancel()
      return
    }
    try {
      void query().then(
        (r) => finish(r?.text ? 'hit' : r ? 'miss' : 'failed', r),
        () => finish('failed'),
      )
    } catch {
      finish('failed')
    }
  })
  return { ready, cancel: () => finish('cancelled') }
}
