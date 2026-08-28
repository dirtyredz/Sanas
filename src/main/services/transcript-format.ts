// The one place transcript lines become text. Three consumers (assist prompts,
// meeting summaries, markdown export) previously each hand-rolled this —
// extracted so the speaker-label and windowing rules can't drift apart.

export interface FormattableLine {
  speaker: number
  isUser: boolean
  text: string
}

/** "Me" | "S1" | "?" — the canonical speaker label. */
export function speakerLabel(l: Pick<FormattableLine, 'speaker' | 'isUser'>): string {
  return l.isUser ? 'Me' : l.speaker >= 0 ? `S${l.speaker + 1}` : '?'
}

/** Render lines as "<label>: <text>" rows, keeping only the most recent capChars
 *  (whole lines — a partial first line is dropped). */
export function renderTranscriptWindow(lines: FormattableLine[], capChars: number): string {
  let transcript = lines.map((l) => `${speakerLabel(l)}: ${l.text}`).join('\n')
  if (transcript.length > capChars) {
    transcript = transcript.slice(-capChars)
    transcript = transcript.slice(transcript.indexOf('\n') + 1)
  }
  return transcript
}
