import type { PresentationHistory } from '@shared/presentation/types'
import { presentationTimeline, slideMarker } from '../../../../shared/presentation/timeline'
import {
  formatClockMs,
  speakerLabel,
  type FormattableLine,
  type SpeakerNames,
} from '../../transcript-format'

export const SLIDE_SUMMARY_INSTRUCTION =
  'Slide markers identify the prepared slide selected at that audio time. They are context, not spoken statements or evidence that its script was delivered. Ground knowledge, decisions and action items in the transcript. Mention a slide title when it helps locate the discussion; do not infer agreement or coverage from navigation alone.'

export function presentationTranscript(
  lines: FormattableLine[],
  history: PresentationHistory,
  cap: number,
  names?: SpeakerNames,
): string {
  const start = lines[0]?.tStartMs ?? 0
  const prior = history.events.filter((e) => e.tMs < start).at(-1)
  const events = history.events.filter((e) => e.tMs >= start)
  if (prior) events.unshift(prior)
  const timeline = presentationTimeline(lines, { ...history, events })
  const rendered = timeline.map((row) =>
    row.kind === 'slide'
      ? `[${formatClockMs(row.tMs)}] ${slideMarker(row.event, row.title)}`
      : `[${formatClockMs(row.tMs)}] ${speakerLabel(row.segment, names)}: ${row.segment.text}`,
  )
  let size = rendered.join('\n').length
  let first = 0
  // Leave room for the active marker when the beginning of the excerpt is dropped.
  while (first < rendered.length && size > cap - 300) size -= rendered[first++].length + 1
  const active = timeline
    .slice(0, first)
    .reverse()
    .find((row) => row.kind === 'slide')
  const prefix =
    active?.kind === 'slide'
      ? `[${formatClockMs(active.tMs)}] ${slideMarker(active.event, active.title)}\n`
      : ''
  return prefix + rendered.slice(first).join('\n')
}
