import { basename, extname } from 'node:path'
import { RESUME_MAX_BYTES, type MeetingResume } from '@shared/meeting/meeting-resume'
import { extractResumeText } from './extract-text'
import { readBounded } from './read-bounded'
import { validateResume } from './resume'

/** Only main's native picker supplies paths. Never retain the binary or source path. */
export async function importResumeFile(path: string): Promise<MeetingResume> {
  const extension = extname(path).toLowerCase()
  if (extension !== '.pdf' && extension !== '.docx') throw new Error('Choose a PDF or DOCX resume.')
  const buffer = await readBounded(path, RESUME_MAX_BYTES, {
    notFile: 'Choose a PDF or DOCX resume.',
    tooLarge: 'Resume file exceeds 5 MB.',
  })
  const text = await extractResumeText(buffer, extension)
  return validateResume({ name: basename(path), text })!
}
