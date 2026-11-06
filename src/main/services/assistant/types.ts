// The LLM seam. All assistant calls go through this interface so the
// provider (Claude today) can be swapped without touching orchestration.

/** One still image sent with a request, already sized and encoded by the caller. */
export interface AssistImage {
  mediaType: 'image/png' | 'image/jpeg'
  /** The encoded image bytes, base64. */
  base64: string
}

export interface AssistRequest {
  /** Local correlation only; providers must not send this metadata to external APIs. */
  diagnostic?: {
    suggestionId?: number
    purpose: string
    manualKind?: string
    turns?: readonly { startMs: number; endMs: number; completedAt: number }[]
  }
  apiKey: string
  /** Org-level keys must name a workspace per request; blank for workspace-scoped keys. */
  workspaceId?: string
  /** Provider model ID, chosen per request by the owning feature. */
  model: string
  cacheableContext?: string
  system: string
  userContent: string
  /** Optional screenshot, placed before `userContent`. Never part of the cached system
   *  blocks. Image-bearing requests are never retried automatically by the provider. */
  image?: AssistImage
  maxTokens: number
  /** Effort/quality dial: 'low' favors latency, 'high' depth. Providers map it
   *  to their nearest native knob (Claude: output_config.effort). */
  effort: 'low' | 'medium' | 'high'
  /** Per-request cancellation and deadline, owned by the calling feature. */
  signal?: AbortSignal
  timeoutMs?: number
  /** Provider-level retries for this request; omit for the provider default. Short-lived
   *  decisions (turn classification, coaching) pass 0: a retried answer arrives stale. */
  maxRetries?: number
  /** Streaming callback; omit for one-shot completions (e.g. summaries). */
  onDelta?: (text: string) => void
  /** Best-effort usage report, at most once per call: on completion, or partial on
   *  failure/cancellation when the provider saw some. Never sent anywhere; a throwing
   *  callback cannot fail generation. */
  onUsage?: (usage: ProviderUsage) => void
}

/** Provider-reported counts, kept as separate fields (never summed here: cache reads and
 *  writes are reported apart from uncached input). A missing field is UNKNOWN, not zero. */
export interface ProviderUsage {
  inputCount?: number
  outputCount?: number
  cacheReadCount?: number
  cacheWriteCount?: number
  /** True when the call did not complete, so the counts cover only what was seen. */
  partial: boolean
}

export interface AssistantProvider {
  /** Runs a completion (streamed via onDelta when given); resolves with the full text. */
  complete(req: AssistRequest): Promise<string>
}
