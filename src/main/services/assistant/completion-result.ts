export interface CompletionResult {
  stopReason: string | null
  text: string
}

/** Refuse to turn an exhausted, empty response into a blank whisper. */
export function completionText(result: CompletionResult): string {
  if (!result.text && result.stopReason === 'max_tokens') {
    throw new Error('Answer budget used up — raise the max token budget for this answer.')
  }
  return result.text
}
