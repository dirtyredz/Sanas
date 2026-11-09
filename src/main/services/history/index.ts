import { IPC } from '@shared/ipc'
import type { HistoryEvent, HistoryHit, SearchMatch } from '@shared/types'
import { loadSettings } from '../../config/settings'
import { ftsAllOf } from '../../db/fts-query'
import { searchSegments } from '../../db/repos/history/transcripts'
import { broadcast } from '../../windows/broadcast'
import { claudeProvider } from '../assistant/provider/claude'
import { HISTORY_SYSTEM, buildHistoryPrompt } from '../assistant/prompts'
import { retrieveHistory } from './retrieval'
import { renderExcerpts } from './excerpts'
export { retrieveHistory, renderExcerpts }

// Your history: ranked search over every transcript, and "what did we decide about X?"
// answered from the transcripts rather than from memory. Retrieval is FTS5 (bm25) over
// every segment, optionally one job; each hit is shown to the model with its neighbours
// so a one-line match carries its context. The answer streams to the windows as
// HistoryEvents; the sources go back synchronously so the UI can show where the answer
// will come from while it is being written — and a source always points at a matched
// line that actually made it into the prompt.

const SEARCH_LIMIT = 50

/** Search page: every word must match, the last as a prefix, ranked. */
export function searchTranscripts(query: string): SearchMatch[] {
  return searchSegments(ftsAllOf(query), { limit: SEARCH_LIMIT })
}

let askSeq = 0

/** Starts an answer: resolves at once with the sources, then streams the answer as
 *  HistoryEvents. Throws a readable Error when it cannot run at all. */
export function askHistory(
  question: string,
  jobId?: number,
): { askId: number; sources: HistoryHit[] } {
  const { anthropicApiKey, anthropicWorkspaceId, answerModel } = loadSettings()
  if (!anthropicApiKey) throw new Error('Anthropic API key is not set — add it in Settings.')
  const { text, included } = renderExcerpts(retrieveHistory(question, jobId))
  const askId = ++askSeq
  const emit = (kind: HistoryEvent['kind'], text: string): void =>
    broadcast(IPC.HistoryEvent, { askId, kind, text } satisfies HistoryEvent)

  if (included.length === 0) {
    setTimeout(() => emit('done', 'Nothing in your meetings mentions that.'), 0)
    return { askId, sources: [] }
  }

  void claudeProvider
    .complete({
      apiKey: anthropicApiKey,
      workspaceId: anthropicWorkspaceId || undefined,
      model: answerModel,
      system: HISTORY_SYSTEM,
      userContent: buildHistoryPrompt(question, text),
      maxTokens: 1200,
      effort: 'medium',
      onDelta: (t) => emit('delta', t),
    })
    .then((answer) => emit('done', answer))
    .catch((e) => emit('error', e instanceof Error ? e.message : String(e)))

  return { askId, sources: included }
}
