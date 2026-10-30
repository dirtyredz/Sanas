import Anthropic from '@anthropic-ai/sdk'
import type { AssistantProvider, AssistRequest } from './types'
import { completionText } from './completion-result'

// Adaptive thinking is model-specific. Opus and Sonnet 5.x accept effort; Haiku and
// unknown custom model IDs get the portable request shape so choosing one cannot break calls.
function supportsEffort(model: string): boolean {
  return /^claude-(?:opus|sonnet)-5(?:-|$)/.test(model)
}

interface SdkRequestOptions {
  signal?: AbortSignal
  timeout?: number
  maxRetries?: number
}

/** Per-request SDK options. The SDK validates every option it is GIVEN — an explicit
 *  `timeout: undefined` is rejected as "timeout must be an integer" — so each one is
 *  included only when the caller set a usable value. */
export function requestOptions(req: AssistRequest): SdkRequestOptions {
  const opts: SdkRequestOptions = {}
  if (req.signal) opts.signal = req.signal
  if (req.timeoutMs !== undefined && Number.isFinite(req.timeoutMs) && req.timeoutMs > 0) {
    opts.timeout = Math.max(1, Math.round(req.timeoutMs))
  }
  if (req.maxRetries !== undefined && Number.isInteger(req.maxRetries) && req.maxRetries >= 0) {
    opts.maxRetries = req.maxRetries
  }
  return opts
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
        system: [req.system, ...(req.cacheableContext ? [req.cacheableContext] : [])].map(
          (text) => ({
            type: 'text' as const,
            text,
            cache_control: { type: 'ephemeral' as const },
          }),
        ),
        messages: [{ role: 'user', content: req.userContent }],
      },
      requestOptions(req),
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
