import type { MeetingResume } from '@shared/meeting-resume'

export function interviewAfterAttachment(
  current: boolean,
  previous: MeetingResume | null,
  next: MeetingResume | null,
): boolean {
  return !previous && next !== null ? true : current
}
