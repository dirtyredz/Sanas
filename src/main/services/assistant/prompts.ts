import type { GlossaryTerm, Job } from '@shared/types'
import { renderTranscriptWindow, type FormattableLine } from '../transcript-format'

// Prompt assembly: stable system prompt (cacheable, per meeting) + volatile
// transcript window in the user turn. Never send the whole meeting (GOTCHAS.md).

export type TranscriptLine = FormattableLine

const WINDOW_CHARS = 6000 // ~recent few minutes of conversation
const SUMMARY_CHARS = 30_000 // a very long meeting still summarizes

export function buildSystemPrompt(job: Job | null, glossary: GlossaryTerm[]): string {
  const parts: string[] = [
    `You are Sanas, a discreet real-time meeting copilot. The user is in a live work
meeting; you see a rolling transcript captured by their laptop microphone ("Me" lines
are the user; S1/S2/… are other participants; labels may be imperfect).

Your job: help the user decide what to say next. Be immediately usable — the user is
reading you mid-conversation. Lead with the substance (a suggested reply, phrasing, or
key point), not with analysis. Never mention that you are an AI or that a transcript
exists. Transcription may contain errors; infer intent charitably.`
  ]

  if (job) {
    const sections: [string, string][] = [
      ['Company info', job.companyInfo],
      ['Project scope', job.projectScope],
      ['Notes', job.notes],
      ['Talking points (steer toward these when natural)', job.talkingPoints],
      ['Persona — how the user wants to come across', job.persona]
    ]
    const pack = sections
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `## ${k}\n${v.trim()}`)
      .join('\n\n')
    if (pack) parts.push(`# Job context: ${job.name}\n\n${pack}`)
  }

  if (glossary.length > 0) {
    parts.push(
      `# Glossary\n${glossary.map((g) => `- ${g.term}${g.note ? `: ${g.note}` : ''}`).join('\n')}`
    )
  }

  return parts.join('\n\n')
}

export function buildUserContent(
  window: TranscriptLine[],
  trigger: 'ambient' | 'hotkey'
): string {
  const transcript = renderTranscriptWindow(window, WINDOW_CHARS)

  const ask =
    trigger === 'hotkey'
      ? `The user pressed the assist hotkey — they want help RIGHT NOW with what to say
next. Give a direct, speakable answer to the current moment of the conversation
(2-6 sentences), then, only if useful, one short bullet of extra ammunition.`
      : `A question or key moment just landed for the user. In 1-2 short sentences, tell
them the essence of what to say. Telegraphic, glanceable — no preamble.`

  return `Rolling transcript (most recent last):\n\n${transcript}\n\n---\n${ask}`
}

/** Post-meeting summary prompt — all prompt text lives here, not in the orchestrator. */
export function buildSummaryPrompt(window: TranscriptLine[]): string {
  const transcript = renderTranscriptWindow(window, SUMMARY_CHARS)
  return `The meeting just ended. Here is the transcript ("Me" = the user):

${transcript}

Write two sections in exactly this format:

SUMMARY
<4-8 sentence summary of what was discussed and decided>

ACTION ITEMS
<bulleted list of concrete follow-ups, each starting with "- "; write "- none" if there are none>`
}
