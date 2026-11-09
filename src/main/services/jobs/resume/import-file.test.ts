import { afterAll, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { RESUME_MAX_BYTES } from '@shared/meeting-resume'
import { importResumeFile } from './import-file'

await mkdir(resolve('.tmp'), { recursive: true })
const directory = await mkdtemp(resolve('.tmp/resume-test-'))
afterAll(() => rm(directory, { recursive: true, force: true }))

// Tiny synthetic PDF writer for fixtures only; production parsing belongs to unpdf.
function pdf(text: string): Buffer {
  const stream = `BT /F1 ${text.length > 100 ? 0.001 : 12} Tf 72 720 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let content = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const offset = content.length
    content += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = content.length
  content += `xref\n0 6\n0000000000 65535 f \n`
  content += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  content += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(content)
}

it('extracts synthetic PDF text and returns only a source basename', async () => {
  const path = join(directory, 'Synthetic.PDF')
  await writeFile(path, pdf('Synthetic Candidate - Camunda engineer'))
  expect(await importResumeFile(path)).toEqual({
    name: 'Synthetic.PDF',
    text: 'Synthetic Candidate - Camunda engineer',
  })
})

it('extracts raw DOCX paragraphs without HTML', async () => {
  expect(
    await importResumeFile(resolve('src/main/services/jobs/resume/fixtures/synthetic.docx')),
  ).toEqual({ name: 'synthetic.docx', text: 'Synthetic Candidate\n\nCamunda engineer' })
})

it('rejects oversize files before attempting parsing', async () => {
  const path = join(directory, 'large.pdf')
  await writeFile(path, Buffer.alloc(RESUME_MAX_BYTES + 1))
  await expect(importResumeFile(path)).rejects.toThrow('Resume file exceeds 5 MB.')
})

it('rejects empty PDF text with the paste fallback', async () => {
  const path = join(directory, 'empty.pdf')
  await writeFile(path, pdf(''))
  await expect(importResumeFile(path)).rejects.toThrow('No text found — paste the text instead.')
})

it('applies the existing 40k validation to extracted text', async () => {
  const path = join(directory, 'long.pdf')
  await writeFile(path, pdf('x'.repeat(40001)))
  await expect(importResumeFile(path)).rejects.toThrow('40,000')
})

it('reports unreadable and unsupported files without disclosing paths', async () => {
  const path = join(directory, 'broken.pdf')
  await writeFile(path, 'not a PDF')
  await expect(importResumeFile(path)).rejects.toThrow('Could not read this resume.')
  await expect(importResumeFile(join(directory, 'resume.txt'))).rejects.toThrow(
    'Choose a PDF or DOCX',
  )
})
