import Anthropic from '@anthropic-ai/sdk'
import type { AssistantProvider, AssistRequest } from '../types'
import { completionText } from '../contracts/completion-result'
import { usageFromAnthropic } from './claude-usage'
import { reportUsage, reportTiming } from './provider-evidence'
import { tagProviderError, type ProviderFailureCategory } from './provider-error'

/** Calls whose output budget is at or under this are short, speakable answers (classifier,
 *  points, smart, coach, interviewer). A model that thinks first would spend the whole
 *  budget on reasoning and return no text (stop_reason max_tokens), so thinking is turned off.
 *  'Full' answers (1200+) keep the model's default. This is the one place the rule lives. */
const SHORT_BUDGET_MAX_TOKENS = 500

type ThinkingOff = { type: 'disabled' } | { type: 'between_tools' }

/** What one model family accepts on the wire. The API 400s on the wrong shape, so every
 *  family quirk lives in this one record and a new family is a new row, not a new predicate.
 *  - effort: adaptive thinking effort (output_config). Opus and Sonnet 5.x accept it.
 *  - thinkingOff: the family's own "off" value for short-budget calls. Haiku takes
 *    'disabled'; Sonnet takes 'between_tools' (and 400s on 'disabled'); Opus takes neither
 *    (omit). */
interface FamilyCapabilities {
  effort: boolean
  thinkingOff?: ThinkingOff
}

/** Haiku and unknown custom model IDs get the portable request shape (no effort, no
 *  thinking override) so choosing one cannot break calls. */
const PORTABLE: FamilyCapabilities = { effort: false }

function familyCapabilities(model: string): FamilyCapabilities {
  if (/^claude-opus-5(?:-|$)/.test(model)) return { effort: true }
  if (/^claude-sonnet-5(?:-|$)/.test(model))
    return { effort: true, thinkingOff: { type: 'between_tools' } }
  if (/^claude-haiku-5(?:-|$)/.test(model))
    return { effort: false, thinkingOff: { type: 'disabled' } }
  return PORTABLE
}

/** The effort and thinking a request actually puts on the wire: one value, used for both the
 *  request body and the 'policy' timing event, so the evidence cannot drift from the call.
 *  `undefined` means the parameter is omitted (the model's default applies). */
function wirePolicy(req: Pick<AssistRequest, 'model' | 'maxTokens' | 'effort'>): {
  effort: AssistRequest['effort'] | undefined
  thinking: ThinkingOff | undefined
} {
  const family = familyCapabilities(req.model)
  return {
    effort: family.effort ? req.effort : undefined,
    thinking: req.maxTokens > SHORT_BUDGET_MAX_TOKENS ? undefined : family.thinkingOff,
  }
}

/** Maps the SDK's transport errors to the neutral category failure-diagnostics reads. The
 *  timeout class extends the connection class, so it is checked first. */
function failureCategory(error: unknown): ProviderFailureCategory | undefined {
  try {
    if (error instanceof Anthropic.APIConnectionTimeoutError) return 'timeout'
    if (error instanceof Anthropic.APIConnectionError) return 'connection'
  } catch {
    /* classification is best effort: it must never replace the real error */
  }
  return undefined
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
  // the retry decision belongs to the request builder (a screenshot is sent once: maxRetries 0)
  return opts
}

/** The user turn: text only, or the image followed by the text. */
export function userMessageContent(
  req: AssistRequest,
): string | (Anthropic.ImageBlockParam | Anthropic.TextBlockParam)[] {
  if (!req.image) return req.userContent
  return [
    {
      type: 'image',
      source: { type: 'base64', media_type: req.image.mediaType, data: req.image.base64 },
    },
    { type: 'text', text: req.userContent },
  ]
}

export const claudeProvider: AssistantProvider = {
  async complete(req: AssistRequest): Promise<string> {
    let attempt = 0
    const client = new Anthropic({
      apiKey: req.apiKey,
      fetch: (...args) => {
        reportTiming(req.onTiming, { kind: 'attempt', at: performance.now(), attempt: ++attempt })
        return globalThis.fetch(...args)
      },
      // org-level keys 400 without this header; workspace-scoped keys don't need it
      defaultHeaders: req.workspaceId ? { 'anthropic-workspace-id': req.workspaceId } : undefined,
    })
    reportTiming(req.onTiming, { kind: 'request-start', at: performance.now() })
    const policy = wirePolicy(req)
    reportTiming(req.onTiming, {
      kind: 'policy',
      at: performance.now(),
      effort: policy.effort ?? 'omitted',
      thinking: policy.thinking?.type ?? 'default',
    })
    const stream = client.messages.stream(
      {
        model: req.model,
        max_tokens: req.maxTokens,
        ...(policy.effort ? { output_config: { effort: policy.effort } } : {}),
        // the SDK types lag the API: 'between_tools' is valid on the wire but not in ThinkingConfigParam
        ...(policy.thinking ? { thinking: policy.thinking as Anthropic.ThinkingConfigParam } : {}),
        // job context pack is stable for the whole meeting — cache it
        system: [req.system, ...(req.cacheableContext ? [req.cacheableContext] : [])].map(
          (text) => ({
            type: 'text' as const,
            text,
            cache_control: { type: 'ephemeral' as const },
          }),
        ),
        messages: [{ role: 'user', content: userMessageContent(req) }],
      },
      requestOptions(req),
    )
    let protocolSeen = false
    stream.on('streamEvent', () => {
      if (protocolSeen) return
      protocolSeen = true
      reportTiming(req.onTiming, { kind: 'first-protocol', at: performance.now() })
    })
    if (req.onDelta) stream.on('text', req.onDelta)
    let final: Anthropic.Message
    try {
      final = await stream.finalMessage()
    } catch (e) {
      // whatever usage the stream saw before it failed or was cancelled, marked partial
      reportUsage(req.onUsage, usageFromAnthropic(stream.currentMessage?.usage, true))
      throw tagProviderError(e, failureCategory(e))
    }
    reportUsage(req.onUsage, usageFromAnthropic(final.usage, false))
    const text = final.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    return completionText({ stopReason: final.stop_reason, text })
  },
}
