import mammoth from 'mammoth'

/** Plain text from a PDF or DOCX buffer. Parser failures surface as the user-facing
 *  "Could not read" error; the binary is never retained. */
export async function extractResumeText(
  buffer: Buffer,
  extension: '.pdf' | '.docx',
): Promise<string> {
  try {
    if (extension === '.pdf') {
      // Native dynamic import preserves unpdf's ESM assets in the externalized main build.
      const { extractText, getDocumentProxy } = await import('unpdf')
      const pdf = await getDocumentProxy(new Uint8Array(buffer))
      try {
        return (await extractText(pdf, { mergePages: true })).text
      } finally {
        await pdf.loadingTask.destroy()
      }
    }
    return (await mammoth.extractRawText({ buffer })).value
  } catch {
    throw new Error('Could not read this resume. Choose another file or paste the text instead.')
  }
}
