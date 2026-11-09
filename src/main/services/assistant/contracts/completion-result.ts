export interface CompletionResult {
  stopReason: string | null
  text: string
}

export class TokenBudgetError extends Error {
  constructor() {
    super('Answer budget used up — raise the max token budget for this answer.')
    this.name = 'TokenBudgetError'
  }
}

/** Refuse to turn an exhausted, empty response into a blank whisper. */
export function completionText(result: CompletionResult): string {
  if (!result.text && result.stopReason === 'max_tokens') {
    throw new TokenBudgetError()
  }
  return result.text
}
