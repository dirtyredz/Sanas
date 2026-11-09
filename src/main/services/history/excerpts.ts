import type { HistoryHit, Segment } from '@shared/types'
import type { Excerpt } from './retrieval'
import { speakerNameMap } from '../../db/repos/transcript/speakers'
import { formatClockMs, speakerLabel } from '../turns/transcript-format'
const MAX_CHARS = 12000
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
