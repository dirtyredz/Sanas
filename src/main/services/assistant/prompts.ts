import type { GlossaryTerm, Job } from '@shared/types'

// Prompt assembly: stable system prompt (cacheable, per meeting) + volatile
// transcript window in the user turn. Never send the whole meeting (GOTCHAS.md).

export interface TranscriptLine {
  speaker: number
  isUser: boolean
  text: string
}

const WINDOW_CHARS = 6000 // ~recent few minutes of conversation

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
  let transcript = window
    .map((l) => `${l.isUser ? 'Me' : l.speaker >= 0 ? `S${l.speaker + 1}` : '?'}: ${l.text}`)
    .join('\n')
  if (transcript.length > WINDOW_CHARS) {
    transcript = transcript.slice(-WINDOW_CHARS)
    transcript = transcript.slice(transcript.indexOf('\n') + 1) // drop partial first line
  }

  const ask =
    trigger === 'hotkey'
      ? `The user pressed the assist hotkey — they want help RIGHT NOW with what to say
next. Give a direct, speakable answer to the current moment of the conversation
(2-6 sentences), then, only if useful, one short bullet of extra ammunition.`
      : `A question or key moment just landed for the user. In 1-2 short sentences, tell
them the essence of what to say. Telegraphic, glanceable — no preamble.`

  return `Rolling transcript (most recent last):\n\n${transcript}\n\n---\n${ask}`
}
