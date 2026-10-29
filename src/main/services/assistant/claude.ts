import Anthropic from '@anthropic-ai/sdk'
import type { AssistantProvider, AssistRequest } from './types'
import { completionText } from './completion-result'

// Adaptive thinking is model-specific. Opus and Sonnet 5.x accept effort; Haiku and
// unknown custom model IDs get the portable request shape so choosing one cannot break calls.
function supportsEffort(model: string): boolean {
  return /^claude-(?:opus|sonnet)-5(?:-|$)/.test(model)
}

export const claudeProvider: AssistantProvider = {
  async complete(req: AssistRequest): Promise<string> {
    const client = new Anthropic({
      apiKey: req.apiKey,
      // org-level keys 400 without this header; workspace-scoped keys don't need it
      defaultHeaders: req.workspaceId ? { 'anthropic-workspace-id': req.workspaceId } : undefined,
    })
    const stream = client.messages.stream(
      {
        model: req.model,
        max_tokens: req.maxTokens,
        ...(supportsEffort(req.model) ? { output_config: { effort: req.effort } } : {}),
        // job context pack is stable for the whole meeting — cache it
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: req.userContent }],
      },
      {
        signal: req.signal,
        timeout: req.timeoutMs,
        ...(req.maxRetries !== undefined ? { maxRetries: req.maxRetries } : {}),
      },
    )
    if (req.onDelta) stream.on('text', req.onDelta)
    const final = await stream.finalMessage()
    const text = final.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    return completionText({ stopReason: final.stop_reason, text })
  },
}
