/** Extracted local text only; the source binary/path never enters meeting history. */
export interface MeetingResume {
  name: string
  text: string
}

export const RESUME_MAX_CHARS = 40_000
export const RESUME_MAX_BYTES = 5 * 1024 * 1024
