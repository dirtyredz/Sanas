import { getMeetingContext } from '../../db/repos/meeting-context'
import { dialog } from 'electron'
import { suggestionLabel } from '@shared/suggestion-label'
import { writeFileSync } from 'fs'
import { getMeeting } from '../../db/repos/meetings'
import { listSegments } from '../../db/repos/segments'
import { listSuggestions } from '../../db/repos/suggestions'
import { getJob } from '../../db/repos/jobs'
import { formatClockMs as fmt, speakerLabel } from '../transcript-format'
import { speakerNameMap } from '../../db/repos/speakers'
import { getPresentationHistory } from '../../db/repos/meeting-presentation'
import { presentationTimeline, slideMarker } from '@shared/presentation/timeline'

/** Builds a markdown export and prompts the user where to save it.
 *  Returns the saved path, or null if the user cancelled. */
export async function exportMeetingMarkdown(meetingId: number): Promise<string | null> {
  const meeting = getMeeting(meetingId)
  if (!meeting) return null
  const job = getJob(meeting.jobId)
  const segments = listSegments(meetingId)
  const suggestions = listSuggestions(meetingId)
  const names = speakerNameMap(meetingId)

  const lines: string[] = [
    `# ${meeting.title}`,
    '',
    `- **Job:** ${job?.name ?? 'Unsorted'}`,
    `- **Started:** ${meeting.startedAt}${meeting.endedAt ? `  \n- **Ended:** ${meeting.endedAt}` : ''}`,
    '',
  ]

  if (meeting.summary) {
    lines.push('## Summary', '', meeting.summary, '')
    if (meeting.actionItems) lines.push('## Action items', '', meeting.actionItems, '')
  }

  const context = getMeetingContext(meetingId)
  if (context.text)
    lines.push(
      '## Meeting context (owner-supplied background, not spoken evidence)',
      '',
      context.text,
      '',
    )
  lines.push('## Transcript', '')
  if (segments.length === 0) lines.push('_No transcript captured._', '')
  for (const row of presentationTimeline(segments, getPresentationHistory(meetingId))) {
    if (row.kind === 'slide') {
      lines.push(`- \`${fmt(row.tMs)}\` **${slideMarker(row.event, row.title)}**`)
      continue
    }
    const s = row.segment
    const who = speakerLabel(s, names)
    lines.push(`- \`${fmt(s.tStartMs)}\` **${who}:** ${s.text}`)
  }
  lines.push('')

  if (suggestions.length > 0) {
    lines.push('## AI suggestions', '')
    for (const s of suggestions) {
      lines.push(`<a id="suggestion-${s.id}"></a>`, '')
      if (s.requestText) lines.push('**Typed request:** ' + s.requestText, '')
      if (s.sourceSuggestionId)
        lines.push(`[Back to source](#suggestion-${s.sourceSuggestionId})`, '')
      for (const child of suggestions.filter((child) => child.sourceSuggestionId === s.id))
        lines.push(`[More detail](#suggestion-${child.id})`, '')
      lines.push(`### ${fmt(s.tMs)} — ${suggestionLabel(s)}`, '', s.text, '')
    }
  }

  const safeTitle = meeting.title.replace(/[^\w\- ]+/g, '').slice(0, 60) || `meeting-${meetingId}`
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export meeting',
    defaultPath: `${safeTitle}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (canceled || !filePath) return null
  writeFileSync(filePath, lines.join('\n'), 'utf-8')
  return filePath
}
