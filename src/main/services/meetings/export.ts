import { dialog } from 'electron'
import { writeFileSync } from 'fs'
import { getMeeting } from '../../db/repos/meetings'
import { listSegments } from '../../db/repos/segments'
import { listSuggestions } from '../../db/repos/suggestions'
import { getJob } from '../../db/repos/jobs'
import { speakerLabel } from '../transcript-format'
import { speakerNameMap } from '../../db/repos/speakers'

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

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

  lines.push('## Transcript', '')
  if (segments.length === 0) lines.push('_No transcript captured._', '')
  for (const s of segments) {
    const who = speakerLabel(s, names)
    lines.push(`- \`${fmt(s.tStartMs)}\` **${who}:** ${s.text}`)
  }
  lines.push('')

  if (suggestions.length > 0) {
    lines.push('## AI suggestions', '')
    for (const s of suggestions) {
      lines.push(
        `### ${fmt(s.tMs)} — ${s.trigger === 'hotkey' ? 'Answer' : 'Whisper'}`,
        '',
        s.text,
        '',
      )
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
