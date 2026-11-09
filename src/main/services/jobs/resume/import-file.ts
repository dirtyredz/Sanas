import { open } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import mammoth from 'mammoth'
import { RESUME_MAX_BYTES, type MeetingResume } from '@shared/meeting/meeting-resume'
import { validateResume } from './resume'

/** Only main's native picker supplies paths. Never retain the binary or source path. */
export async function importResumeFile(path: string): Promise<MeetingResume> {
  const extension = extname(path).toLowerCase()
  if (extension !== '.pdf' && extension !== '.docx') throw new Error('Choose a PDF or DOCX resume.')
  const file = await open(path, 'r')
  let buffer: Buffer
  try {
    const stat = await file.stat()
    if (!stat.isFile()) throw new Error('Choose a PDF or DOCX resume.')
    if (stat.size > RESUME_MAX_BYTES) throw new Error('Resume file exceeds 5 MB.')
    // Bound the read even if the selected file grows after stat.
    buffer = Buffer.alloc(RESUME_MAX_BYTES + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null)
      if (!bytesRead) break
      length += bytesRead
    }
    if (length > RESUME_MAX_BYTES) throw new Error('Resume file exceeds 5 MB.')
    buffer = buffer.subarray(0, length)
  } finally {
    await file.close()
  }

  let text: string
  try {
    if (extension === '.pdf') {
      // Native dynamic import preserves unpdf's ESM assets in the externalized main build.
      const { extractText, getDocumentProxy } = await import('unpdf')
      const pdf = await getDocumentProxy(new Uint8Array(buffer))
      try {
        text = (await extractText(pdf, { mergePages: true })).text
      } finally {
        await pdf.loadingTask.destroy()
      }
    } else {
      text = (await mammoth.extractRawText({ buffer })).value
    }
  } catch {
    throw new Error('Could not read this resume. Choose another file or paste the text instead.')
  }
  return validateResume({ name: basename(path), text })!
}
