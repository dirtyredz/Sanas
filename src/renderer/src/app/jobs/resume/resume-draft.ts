import { RESUME_MAX_CHARS, type MeetingResume } from '@shared/meeting-resume'

/** Why a draft cannot be saved, or '' when it can. Removing (null) is always saveable. Main
 *  re-validates; this only keeps the Save button honest and the message readable. */
export function resumeDraftProblem(draft: MeetingResume | null): string {
  if (!draft) return ''
  if (!draft.name.trim()) return 'Give the resume a name.'
  if (!draft.text.trim() || draft.text.length > RESUME_MAX_CHARS)
    return `Resume must contain text and be no longer than ${RESUME_MAX_CHARS.toLocaleString('en-US')} characters. Shorten or remove it before saving.`
  return ''
}

export function sameResume(a: MeetingResume | null, b: MeetingResume | null): boolean {
  return a === b || (!!a && !!b && a.name === b.name && a.text === b.text)
}

/** Editing the pasted text: clearing it entirely removes the draft. */
export function withText(draft: MeetingResume | null, text: string): MeetingResume | null {
  return text ? { name: draft?.name ?? 'Pasted text', text } : null
}
