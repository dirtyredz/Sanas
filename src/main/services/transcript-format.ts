// The one place transcript lines become text. Three consumers (assist prompts,
// meeting summaries, markdown export) previously each hand-rolled this —
// extracted so the speaker-label and windowing rules can't drift apart.

export interface FormattableLine {
  speaker: number
  isUser: boolean
  text: string
}

/** Per-meeting user-assigned names, keyed by diarized speaker index. */
export type SpeakerNames = ReadonlyMap<number, string>

/** "Me" | "Sarah" | "S1" | "?" — the canonical speaker label. Names win over
 *  indices; the user is always "Me". */
export function speakerLabel(
  l: Pick<FormattableLine, 'speaker' | 'isUser'>,
  names?: SpeakerNames,
): string {
  if (l.isUser) return 'Me'
  return names?.get(l.speaker) ?? (l.speaker >= 0 ? `S${l.speaker + 1}` : '?')
}

/** Render lines as "<label>: <text>" rows, keeping only the most recent capChars
 *  (whole lines — a partial first line is dropped). */
export function renderTranscriptWindow(
  lines: FormattableLine[],
  capChars: number,
  names?: SpeakerNames,
): string {
  let transcript = lines.map((l) => `${speakerLabel(l, names)}: ${l.text}`).join('\n')
  if (transcript.length > capChars) {
    transcript = transcript.slice(-capChars)
    transcript = transcript.slice(transcript.indexOf('\n') + 1)
  }
  return transcript
}
