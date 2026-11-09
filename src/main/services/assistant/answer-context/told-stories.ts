// The stories already told this meeting: what an answer prompt needs so the model does not
// re-tell the same project to every new question ("broken record", DECISIONS 2026-11-04).
// A headline alone is not enough: the project usually sits in the first supporting line, and
// a model told "do not repeat these headlines" still re-tells the story behind them.

import type { SuggestionPurpose } from '@shared/types'
import type { ManualKind } from '@shared/live-controls/types'
import { stripFillerMarkers } from '@shared/filler-marker'
import { NO_SUGGESTION } from '@shared/live-controls/readable-suggestion'
import { headlineOf } from '../compact-contract'

export interface ToldStory {
  headline: string
  /** The first supporting prose line (code is skipped); empty when the answer had none. */
  detail: string
}

/** How many told stories an answer prompt carries, and so how many are kept. */
export const TOLD_STORIES = 6
const DETAIL_CHARS = 200

/** Answers whose text the user may have said aloud: automatic, Answer now, More detail and
 *  typed asks. Next points, audience questions and screen answers are not stories. */
export function tellsStory(purpose: SuggestionPurpose, manualKind?: ManualKind | null): boolean {
  if (purpose !== 'answer') return false
  return !manualKind || manualKind === 'detail' || manualKind === 'typed'
}

function clean(line: string): string {
  return stripFillerMarkers(line.replace(/\*\*/g, ''))
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')
    .trim()
}

/** Headline plus the first supporting prose line of a compact answer. */
export function storyOf(text: string): ToldStory {
  const lines = text.split('\n')
  const first = lines.findIndex((l) => l.trim())
  let inCode = false
  let detail = ''
  for (const line of lines.slice(first + 1)) {
    if (line.trim().startsWith('```')) {
      inCode = !inCode
      continue
    }
    if (inCode || !line.trim()) continue
    detail = clean(line).slice(0, DETAIL_CHARS)
    if (detail) break
  }
  return { headline: headlineOf(text), detail }
}

/** Records a shown answer, keeping only as many as the prompt uses. The same headline told
 *  again (an automatic answer and an Answer now to one question) moves to the end instead of
 *  taking a second slot. */
export function rememberStory(stories: ToldStory[], text: string): void {
  const story = storyOf(text)
  if (!story.headline) return
  const same = stories.findIndex((s) => s.headline === story.headline)
  if (same >= 0) stories.splice(same, 1)
  stories.push(story)
  if (stories.length > TOLD_STORIES) stories.splice(0, stories.length - TOLD_STORIES)
}

/** The "already told" block for an answer prompt. Automatic answers may decline with the
 *  no-op; a requested answer (Answer now) must still answer. */
export function toldStoriesBlock(stories: readonly ToldStory[], allowNoop: boolean): string {
  const recent = stories.slice(-TOLD_STORIES).filter((s) => s.headline)
  const list =
    recent.length > 0
      ? recent.map((s) => `- ${s.headline}${s.detail ? ` / ${s.detail}` : ''}`).join('\n')
      : '(none yet)'
  const end = allowNoop
    ? `If your best suggestion is essentially the same as one of them, output exactly ${NO_SUGGESTION} and nothing else.`
    : 'You must still answer the current question.'
  return `Stories and answers already given to Me this meeting (headline / first supporting line, most recent last):
${list}
Do not re-tell these stories or bring back their projects, employers or technologies unless the
current question asks about them. If the current question really needs the same project, refer
back to it in one short clause (for example "like the project I mentioned") and add only what
the question asks.

When the asked technology appears in several resume roles, pick the role or project that best
matches it (the one whose line is mainly about that technology, not a side detail of a bigger
project) and that is not listed here, even if it is older. A word like "recently" or "last" is
not a reason to go back to a role already told. If the only match was already told, answer at
the level of the technology (what you build with it and how) without re-telling that story or
naming its other technologies. Do not add a second role or a closing "more recently, at ..."
line to round the answer out. ${end}`
}
