// The LLM seam. All assistant calls go through this interface so the
// provider (Claude today) can be swapped without touching orchestration.

export interface AssistRequest {
  apiKey: string
  /** Org-level keys must name a workspace per request; blank for workspace-scoped keys. */
  workspaceId?: string
  /** Provider model ID, chosen per request by the owning feature. */
  model: string
  system: string
  userContent: string
  maxTokens: number
  /** Effort/quality dial: 'low' favors latency, 'high' depth. Providers map it
   *  to their nearest native knob (Claude: output_config.effort). */
  effort: 'low' | 'medium' | 'high'
  /** Per-request cancellation and deadline, owned by the calling feature. */
  signal?: AbortSignal
  timeoutMs?: number
  /** Streaming callback; omit for one-shot completions (e.g. summaries). */
  onDelta?: (text: string) => void
}

export interface AssistantProvider {
  /** Runs a completion (streamed via onDelta when given); resolves with the full text. */
  complete(req: AssistRequest): Promise<string>
}
