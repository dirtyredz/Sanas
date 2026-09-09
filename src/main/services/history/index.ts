import { IPC } from '@shared/ipc'
import type { HistoryEvent, HistoryHit, SearchMatch, Segment } from '@shared/types'
import { stripMatchMarkers } from '@shared/search-markers'
import { loadSettings } from '../../config/settings'
import { ftsAllOf, ftsAnyOf } from '../../db/fts-query'
import { listSegmentsAround, searchSegments } from '../../db/repos/segments'
import { speakerNameMap } from '../../db/repos/speakers'
import { broadcast } from '../../windows/broadcast'
import { claudeProvider } from '../assistant/claude'
import { HISTORY_SYSTEM, buildHistoryPrompt } from '../assistant/prompts'
import { formatClockMs, speakerLabel } from '../transcript-format'

// Your history: ranked search over every transcript, and "what did we decide about X?"
// answered from the transcripts rather than from memory. Retrieval is FTS5 (bm25) over
// every segment, optionally one job; each hit is shown to the model with its neighbours
// so a one-line match carries its context. The answer streams to the windows as
// HistoryEvents; the sources go back synchronously so the UI can show where the answer
// will come from while it is being written — and a source always points at a matched
// line that actually made it into the prompt.

const HITS = 24 // ranked segments to consider
const RADIUS = 2 // neighbouring segments on each side of a hit
const MAX_SOURCES = 8 // distinct meetings surfaced to the user
const MAX_CHARS = 12_000 // excerpt budget in the prompt

const SEARCH_LIMIT = 50

/** Search page: every word must match, the last as a prefix, ranked. */
export function searchTranscripts(query: string): SearchMatch[] {
  return searchSegments(ftsAllOf(query), { limit: SEARCH_LIMIT })
}

interface Match {
  tStartMs: number
  snippet: string
}

interface Excerpt {
  hit: HistoryHit
  /** the segments that matched, keyed by id (the rest of `lines` is their context) */
  matches: Map<number, Match>
  lines: Segment[]
}

/** Ranked meetings with the segments around each hit, deduplicated per meeting. */
export function retrieveHistory(question: string, jobId?: number): Excerpt[] {
  const hits = searchSegments(ftsAnyOf(question), { jobId, limit: HITS })
  const byMeeting = new Map<number, Excerpt>()
  for (const h of hits) {
    const match: Match = { tStartMs: h.tStartMs, snippet: stripMatchMarkers(h.snippet) }
    const around = listSegmentsAround(h.meeting.id, h.segmentId, RADIUS)
    const ex = byMeeting.get(h.meeting.id)
    if (ex) {
      const seen = new Set(ex.lines.map((s) => s.id))
      ex.lines.push(...around.filter((s) => !seen.has(s.id)))
      ex.lines.sort((a, b) => a.tStartMs - b.tStartMs)
      ex.matches.set(h.segmentId, match)
    } else {
      byMeeting.set(h.meeting.id, {
        hit: {
          meetingId: h.meeting.id,
          title: h.meeting.title,
          jobName: h.jobName,
          startedAt: h.meeting.startedAt,
          ...match,
        },
        matches: new Map([[h.segmentId, match]]),
        lines: around,
      })
    }
  }
  return [...byMeeting.values()].slice(0, MAX_SOURCES)
}

/** Excerpts → the text the model reads (one block per meeting, labelled lines in time
 *  order) and the sources that made it in. The budget is applied line by line with the
 *  matched lines claimed first, so a meeting is only reported when at least one of its
 *  matched lines is in the prompt, and the reported time/snippet is that line's — never a
 *  top-ranked line the budget cut. The very first matched line is always included, so a
 *  real hit can never be reported as "nothing found". */
export function renderExcerpts(excerpts: Excerpt[]): { text: string; included: HistoryHit[] } {
  const blocks: string[] = []
  const included: HistoryHit[] = []
  let used = 0
  for (const ex of excerpts) {
    const names = speakerNameMap(ex.hit.meetingId)
    const header = `## ${ex.hit.title} — ${ex.hit.startedAt.slice(0, 10)} (${ex.hit.jobName})`
    const render = (s: Segment): string =>
      `[${formatClockMs(s.tStartMs)}] ${speakerLabel(s, names)}: ${s.text}`
    const matched = ex.lines.filter((s) => ex.matches.has(s.id))
    const context = ex.lines.filter((s) => !ex.matches.has(s.id))
    const chosen = new Map<number, string>()
    let size = header.length
    for (const s of [...matched, ...context]) {
      const line = render(s)
      const fits = used + size + line.length + 1 <= MAX_CHARS
      const mustHave = included.length === 0 && chosen.size === 0 // first line of the first source
      if (!fits && !mustHave) continue
      chosen.set(s.id, line)
      size += line.length + 1
    }
    const shown = matched.find((s) => chosen.has(s.id))
    if (!shown) continue // no matched line fit: not a source
    const body = ex.lines.filter((s) => chosen.has(s.id)).map((s) => chosen.get(s.id)!)
    blocks.push([header, ...body].join('\n'))
    included.push({ ...ex.hit, ...ex.matches.get(shown.id)! })
    used += size + 2
  }
  return { text: blocks.join('\n\n'), included }
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
