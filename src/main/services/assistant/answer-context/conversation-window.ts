import {
  renderTranscriptWindow,
  type FormattableLine,
  type SpeakerNames,
} from '../../turns/transcript-format'
import { boundedExcerpt } from '../prompts/excerpt'

// The transcript an answer prompt sees, split in two (DECISIONS 2026-11-04): the CURRENT
// EXCHANGE (the question being answered and Me's reply so far) and a short, clearly
// labelled BACKGROUND of what came before. A single newest-6,000-character window let the
// previous topic dominate: the new question was a few percent of it, and the model carried
// the earlier technologies and stories into the new answer.

/** Earlier conversation kept as background, newest last. */
export const BACKGROUND_CHARS = 2_500
/** The current exchange; when longer, its opening (the question) and newest text are kept. */
export const CURRENT_EXCHANGE_CHARS = 4_000
/** Without a known exchange start: the rolling window (the pre-split behaviour). */
export const ROLLING_WINDOW_CHARS = 6_000
/** A window line may start slightly before the turn the assembler reports. */
const START_TOLERANCE_MS = 250

export const BACKGROUND_LABEL =
  'Earlier conversation (background only: do not reuse its topics, technologies or stories unless the current question asks for them; most recent last):'
export const CURRENT_EXCHANGE_LABEL =
  "Current exchange (the question being answered and Me's reply so far; answer this):"

export interface SplitWindow<L> {
  background: L[]
  current: L[]
}

/** Splits at the first line spoken at or after `startMs` (audio time). Untimed lines before
 *  it are background; everything from it on, timed or not, is the current exchange. */
export function splitAtExchange<L extends FormattableLine>(
  lines: readonly L[],
  startMs: number,
): SplitWindow<L> {
  const at = lines.findIndex(
    (l) => l.tStartMs !== undefined && l.tStartMs >= startMs - START_TOLERANCE_MS,
  )
  if (at < 0) return { background: [...lines], current: [] }
  return { background: lines.slice(0, at), current: lines.slice(at) }
}

function render(lines: FormattableLine[], names?: SpeakerNames): string {
  return renderTranscriptWindow(lines, Number.POSITIVE_INFINITY, names)
}

/** Background section only: the newest `BACKGROUND_CHARS` of `lines`, labelled. */
export function renderBackground(lines: FormattableLine[], names?: SpeakerNames): string {
  const text = renderTranscriptWindow(lines, BACKGROUND_CHARS, names)
  return `${BACKGROUND_LABEL}\n${text || '(nothing earlier)'}`
}

/** The transcript part of an answer prompt. With an exchange start: background + current
 *  exchange. Without one (Answer now with no recent question): the rolling window. */
export function renderConversation(
  lines: FormattableLine[],
  exchangeStartMs: number | undefined,
  names?: SpeakerNames,
): string {
  if (exchangeStartMs === undefined)
    return `Rolling transcript (most recent last):\n\n${renderTranscriptWindow(lines, ROLLING_WINDOW_CHARS, names)}`
  const { background, current } = splitAtExchange(lines, exchangeStartMs)
  const exchange = current.length
    ? boundedExcerpt(render(current, names), CURRENT_EXCHANGE_CHARS)
    : '(only the question below so far)'
  return `${renderBackground(background, names)}\n\n${CURRENT_EXCHANGE_LABEL}\n${exchange}`
}
