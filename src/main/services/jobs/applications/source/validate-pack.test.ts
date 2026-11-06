import { expect, it } from 'vitest'
import { isSafeApplicationId, packFingerprint, validatePack, type ValidPack } from './validate-pack'

const thin = (extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  applicationId: 'acme',
  stage: 'interview',
  company: 'Acme',
  ...extra,
})

function ok(raw: unknown, stem = 'acme'): ValidPack {
  const result = validatePack(raw, stem)
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`)
  return result.pack
}

function err(raw: unknown, stem = 'acme'): string {
  const result = validatePack(raw, stem)
  if (result.ok) throw new Error('expected an error')
  return result.error
}

it('normalizes a thin pack: optional text empty, judgement fields null, resume null', () => {
  expect(ok(thin())).toEqual({
    applicationId: 'acme',
    stage: 'interview',
    company: 'Acme',
    role: '',
    projectScope: '',
    notes: '',
    jdUrl: '',
    companyInfo: null,
    talkingPoints: null,
    persona: null,
    glossary: null,
    resume: null,
    contentHash: null,
    updatedAt: null,
    fieldSources: {},
    normalized: [],
  })
})

it('maps a fully populated pack through and never exposes pdfPath', () => {
  const pack = ok(
    thin({
      role: 'Engineer',
      projectScope: 'Scope',
      notes: 'Notes',
      jdUrl: 'https://example.com/job',
      companyInfo: 'Info',
      talkingPoints: 'Points',
      persona: 'Persona',
      resume: { name: 'cv.pdf', text: 'Resume body', pdfPath: 'C:\\secret\\cv.pdf' },
      contentHash: 'abc123',
      updatedAt: '2026-01-02T03:04:05.000Z',
      glossary: ['alpha', 'beta'],
      fieldSources: { talkingPoints: 'prep', persona: null },
    }),
  )
  expect(pack.role).toBe('Engineer')
  expect(pack.projectScope).toBe('Scope')
  expect(pack.notes).toBe('Notes')
  expect(pack.jdUrl).toBe('https://example.com/job')
  expect(pack.resume).toEqual({ name: 'cv.pdf', text: 'Resume body' })
  expect(pack.contentHash).toBe('abc123')
  expect(pack.updatedAt).toBe('2026-01-02T03:04:05.000Z')
  expect(pack.glossary).toEqual(['alpha', 'beta'])
  expect(pack.fieldSources.talkingPoints).toBe('prep')
  expect(pack.fieldSources.persona).toBeNull()
  expect(JSON.stringify(pack)).not.toContain('pdfPath')
  expect(JSON.stringify(pack)).not.toContain('secret')
})

it('accepts text of exactly 20,000 characters and rejects 20,001', () => {
  expect(ok(thin({ notes: 'x'.repeat(20_000) })).notes).toHaveLength(20_000)
  expect(err(thin({ notes: 'x'.repeat(20_001) }))).toMatch(/notes/)
})

it('bounds resume text at 40,000 and name at 255', () => {
  expect(ok(thin({ resume: { name: 'n', text: 'x'.repeat(40_000) } })).resume?.text).toHaveLength(
    40_000,
  )
  expect(err(thin({ resume: { name: 'n', text: 'x'.repeat(40_001) } }))).toMatch(/resume text/)
  expect(ok(thin({ resume: { name: 'n'.repeat(255), text: 'body' } })).resume?.name).toHaveLength(
    255,
  )
  expect(err(thin({ resume: { name: 'n'.repeat(256), text: 'body' } }))).toMatch(/resume name/)
})

it('bounds the glossary at 1,000 entries', () => {
  const entries = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`)
  expect(ok(thin({ glossary: entries(1_000) })).glossary).toHaveLength(1_000)
  expect(err(thin({ glossary: entries(1_001) }))).toMatch(/glossary/)
})

it('rejects unsupported schema versions with a message', () => {
  for (const schemaVersion of [2, undefined, '1']) {
    expect(err({ ...thin(), schemaVersion })).toMatch(/Unsupported pack version/)
  }
})

it('rejects non-object packs', () => {
  expect(err(null)).toMatch(/not a JSON object/)
  expect(err([])).toMatch(/not a JSON object/)
  expect(err('x')).toMatch(/not a JSON object/)
})

it('rejects wrong types', () => {
  expect(err(thin({ company: 5 }))).toMatch(/company/)
  expect(err(thin({ notes: ['a'] }))).toMatch(/notes/)
  expect(err(thin({ glossary: 'abc' }))).toMatch(/glossary/)
  expect(err(thin({ glossary: ['ok', 5] }))).toMatch(/glossary entry 2/)
  expect(err(thin({ resume: 'text' }))).toMatch(/resume/)
  expect(err(thin({ fieldSources: ['talkingPoints'] }))).toMatch(/fieldSources/)
  expect(err(thin({ updatedAt: 'yesterday' }))).toMatch(/updatedAt/)
})

it('requires a non-blank company', () => {
  expect(err(thin({ company: '' }))).toMatch(/company is required/)
  expect(err(thin({ company: '   ' }))).toMatch(/company is required/)
  const { company: _company, ...without } = thin()
  expect(err(without)).toMatch(/company is required/)
})

it('rejects a bad stage and an applicationId that differs from the file stem', () => {
  expect(err(thin({ stage: 'applied' }))).toMatch(/stage/)
  expect(err(thin(), 'other')).toMatch(/does not match/)
  expect(err(thin({ applicationId: '../x' }), '../x')).toMatch(/unsafe/)
})

it('isSafeApplicationId allows plain IDs and refuses traversal, separators and device names', () => {
  for (const bad of [
    '../x',
    'a/b',
    'a\\b',
    'CON',
    'nul.txt',
    '.hidden',
    'x.',
    'a..b',
    'a'.repeat(129),
    '',
  ]) {
    expect(isSafeApplicationId(bad), bad).toBe(false)
  }
  expect(isSafeApplicationId(5)).toBe(false)
  expect(isSafeApplicationId('a'.repeat(128))).toBe(true)
  expect(isSafeApplicationId('acme-2026_01.v2')).toBe(true)
})

it('normalizes line endings and control characters and reports the field', () => {
  const pack = ok(thin({ notes: 'a\r\nb\rc\u0000d\u0007e\tf\ng' }))
  expect(pack.notes).toBe('a\nb\ncde\tf\ng')
  expect(pack.normalized.some((n) => n.startsWith('notes'))).toBe(true)
})

it('does not report normalization for clean text', () => {
  expect(ok(thin({ notes: 'a\tb\nc' })).normalized).toEqual([])
})

it('drops a non-http jdUrl and says so', () => {
  const pack = ok(thin({ jdUrl: 'javascript:alert(1)' }))
  expect(pack.jdUrl).toBe('')
  expect(pack.normalized.some((n) => n.startsWith('jdUrl'))).toBe(true)
})

it('drops unknown properties', () => {
  const pack = ok(thin({ extra: 'x', resume: { name: 'n', text: 't', other: 1 } }))
  expect(pack).not.toHaveProperty('extra')
  expect(JSON.stringify(pack)).not.toContain('other')
  expect(pack.resume).toEqual({ name: 'n', text: 't' })
})

it('treats a missing contentHash as null', () => {
  expect(ok(thin()).contentHash).toBeNull()
})

it('packFingerprint is stable, content-sensitive and ignores contentHash/updatedAt', () => {
  const a = ok(thin({ notes: 'one', contentHash: 'h1', updatedAt: '2026-01-01T00:00:00Z' }))
  const b = ok(thin({ notes: 'one', contentHash: 'h2', updatedAt: '2026-02-01T00:00:00Z' }))
  const c = ok(thin({ notes: 'two', contentHash: 'h1', updatedAt: '2026-01-01T00:00:00Z' }))
  expect(packFingerprint(a)).toBe(packFingerprint(ok(thin({ notes: 'one' }))))
  expect(packFingerprint(a)).toBe(packFingerprint(b))
  expect(packFingerprint(a)).not.toBe(packFingerprint(c))
})
