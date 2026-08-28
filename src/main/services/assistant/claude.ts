import Anthropic from '@anthropic-ai/sdk'
import type { AssistantProvider, AssistRequest } from './types'

// Claude Opus 5: thinking is adaptive by default (no `thinking` param needed);
// effort dials depth vs latency — 'low' keeps ambient nudges snappy.

const MODEL = 'claude-opus-5'

export const claudeProvider: AssistantProvider = {
  async streamSuggestion(req: AssistRequest): Promise<string> {
    const client = new Anthropic({ apiKey: req.apiKey })
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: req.maxTokens,
      output_config: { effort: req.effort },
      // job context pack is stable for the whole meeting — cache it
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: req.userContent }]
    })
    stream.on('text', (delta) => req.onDelta(delta))
    const final = await stream.finalMessage()
    return final.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
  }
}
