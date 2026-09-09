import { IPC } from '@shared/ipc'
import type { HistoryEvent, HistoryHit, Segment } from '@shared/types'
import { loadSettings } from '../../config/settings'
import { ftsAnyOf } from '../../db/fts-query'
import { listSegmentsAround, searchSegments } from '../../db/repos/segments'
import { speakerNameMap } from '../../db/repos/speakers'
import { broadcast } from '../../windows/broadcast'
import { claudeProvider } from '../assistant/claude'
import { HISTORY_SYSTEM, buildHistoryPrompt } from '../assistant/prompts'
import { formatClockMs, speakerLabel } from '../transcript-format'

// "What did we decide about X?" — answered from the transcripts, not from memory.
// Retrieval is FTS5 (bm25) over every segment, optionally one job; each hit is shown to
// the model with its neighbours so a one-line match carries its context. The answer
// streams to the windows as HistoryEvents; the sources go back synchronously so the UI
// can show where the answer will come from while it is being written.

const HITS = 24 // ranked segments to consider
const RADIUS = 2 // neighbouring segments on each side of a hit
const MAX_SOURCES = 8 // distinct meetings surfaced to the user
const MAX_CHARS = 12_000 // excerpt budget in the prompt

interface Excerpt {
  hit: HistoryHit
  lines: Segment[]
}

/** Ranked meetings with the segments around each hit, deduplicated per meeting. */
export function retrieveHistory(question: string, jobId?: number): Excerpt[] {
  const hits = searchSegments(ftsAnyOf(question), { jobId, limit: HITS })
  const byMeeting = new Map<number, Excerpt>()
  for (const h of hits) {
    const around = listSegmentsAround(h.meeting.id, h.segmentId, RADIUS)
    const ex = byMeeting.get(h.meeting.id)
    if (ex) {
      const seen = new Set(ex.lines.map((s) => s.id))
      ex.lines.push(...around.filter((s) => !seen.has(s.id)))
      ex.lines.sort((a, b) => a.tStartMs - b.tStartMs)
    } else {
      byMeeting.set(h.meeting.id, {
        hit: {
          meetingId: h.meeting.id,
          title: h.meeting.title,
          jobName: h.jobName,
          startedAt: h.meeting.startedAt,
          tStartMs: h.tStartMs,
          snippet: h.snippet.replaceAll('\u0001', '').replaceAll('\u0002', ''),
        },
        lines: around,
      })
    }
  }
  return [...byMeeting.values()].slice(0, MAX_SOURCES)
}

/** Excerpts → the text the model reads: one block per meeting, labelled lines. */
export function renderExcerpts(excerpts: Excerpt[]): string {
  const blocks: string[] = []
  let used = 0
  for (const ex of excerpts) {
    const names = speakerNameMap(ex.hit.meetingId)
    const block = [
      `## ${ex.hit.title} — ${ex.hit.startedAt.slice(0, 10)} (${ex.hit.jobName})`,
      ...ex.lines.map((s) => `[${formatClockMs(s.tStartMs)}] ${speakerLabel(s, names)}: ${s.text}`),
    ].join('\n')
    if (used + block.length > MAX_CHARS) break
    blocks.push(block)
    used += block.length
  }
  return blocks.join('\n\n')
}

let askSeq = 0

/** Starts an answer: resolves at once with the sources, then streams the answer as
 *  HistoryEvents. Throws a readable Error when it cannot run at all. */
export function askHistory(
  question: string,
  jobId?: number,
): { askId: number; sources: HistoryHit[] } {
  const { anthropicApiKey, anthropicWorkspaceId } = loadSettings()
  if (!anthropicApiKey) throw new Error('Anthropic API key is not set — add it in Settings.')
  const excerpts = retrieveHistory(question, jobId)
  const askId = ++askSeq
  const emit = (kind: HistoryEvent['kind'], text: string): void =>
    broadcast(IPC.HistoryEvent, { askId, kind, text } satisfies HistoryEvent)

  if (excerpts.length === 0) {
    setTimeout(() => emit('done', 'Nothing in your meetings mentions that.'), 0)
    return { askId, sources: [] }
  }

  void claudeProvider
    .complete({
      apiKey: anthropicApiKey,
      workspaceId: anthropicWorkspaceId || undefined,
      system: HISTORY_SYSTEM,
      userContent: buildHistoryPrompt(question, renderExcerpts(excerpts)),
      maxTokens: 1200,
      effort: 'medium',
      onDelta: (t) => emit('delta', t),
    })
    .then((text) => emit('done', text))
    .catch((e) => emit('error', e instanceof Error ? e.message : String(e)))

  return { askId, sources: excerpts.map((ex) => ex.hit) }
}
