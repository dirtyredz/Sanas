import { RESUME_MAX_CHARS, type MeetingResume } from '@shared/meeting-resume'

/** Validate at main-process ingress, including pasted text and direct service callers. */
export function validateResume(raw: unknown): MeetingResume | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'object') throw new Error('Invalid meeting resume.')
  const { name, text } = raw as Record<string, unknown>
  if (typeof name !== 'string' || !name.trim() || name.length > 255)
    throw new Error('Resume name must contain 1–255 characters.')
  if (typeof text !== 'string') throw new Error('Resume text must be text.')
  if (text.length > RESUME_MAX_CHARS)
    throw new Error(
      `Resume exceeds ${RESUME_MAX_CHARS.toLocaleString('en-US')} characters. Paste a shorter version instead.`,
    )
  const cleaned = text.replaceAll('\0', '').trim()
  if (!cleaned) throw new Error('No text found — paste the text instead.')
  return { name: name.trim(), text: cleaned }
}
