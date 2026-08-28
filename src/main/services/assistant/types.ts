// The LLM seam. All assistant calls go through this interface so the
// provider (Claude today) can be swapped without touching orchestration.

export interface AssistRequest {
  apiKey: string
  system: string
  userContent: string
  maxTokens: number
  /** Provider-specific effort/quality dial: 'low' favors latency, 'high' depth. */
  effort: 'low' | 'medium' | 'high'
  onDelta: (text: string) => void
}

export interface AssistantProvider {
  /** Streams a completion; resolves with the full text. */
  streamSuggestion(req: AssistRequest): Promise<string>
}
