import { describe, expect, it } from 'vitest'
import { mapPack, normalizeGlossary, packResume, proposedJobName } from './map-pack'
import type { ValidPack } from './source/validate-pack'

function makePack(over: Partial<ValidPack> = {}): ValidPack {
  return {
    applicationId: 'app-1',
    stage: 'interview',
    company: 'Acme',
    role: 'Engineer',
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
    ...over,
  }
}

describe('proposedJobName', () => {
  it('joins company and role', () => {
    expect(proposedJobName('Acme', 'Engineer')).toEqual({
      proposed: 'Acme — Engineer',
      shortened: false,
    })
  })

  it('uses company alone when role is empty', () => {
    expect(proposedJobName('Acme', '')).toEqual({ proposed: 'Acme', shortened: false })
  })

  it('shortens a long name to exactly 120 chars ending in an ellipsis', () => {
    const r = proposedJobName('C'.repeat(100), 'R'.repeat(100))
    expect(r.shortened).toBe(true)
    expect(r.proposed).toHaveLength(120)
    expect(r.proposed.endsWith('…')).toBe(true)
  })

  it('keeps a name of exactly 120 chars unshortened', () => {
    const r = proposedJobName('C'.repeat(120), '')
    expect(r.shortened).toBe(false)
    expect(r.proposed).toHaveLength(120)
  })
})

describe('normalizeGlossary', () => {
  it('collapses whitespace, trims, drops empties, dedupes case-insensitively in order', () => {
    const { terms, excluded } = normalizeGlossary([
      '  Kubernetes ',
      'kubernetes',
      '',
      '   ',
      'Event   Sourcing',
      'event sourcing',
      'KUBERNETES',
      'Go',
    ])
    expect(terms).toEqual(['Kubernetes', 'Event Sourcing', 'Go'])
    expect(excluded).toEqual([])
  })

  it('reports terms over 100 chars as excluded', () => {
    const long = 'x'.repeat(101)
    const { terms, excluded } = normalizeGlossary(['ok', long])
    expect(terms).toEqual(['ok'])
    expect(excluded).toEqual([long])
  })

  it('reports terms beyond the byte budget as excluded, losing none silently', () => {
    const raw = Array.from({ length: 150 }, (_, i) => `term-${String(i).padStart(3, '0')}`)
    const { terms, excluded } = normalizeGlossary(raw)
    expect(terms.length).toBeLessThanOrEqual(100)
    expect(excluded.length).toBeGreaterThan(0)
    expect([...terms, ...excluded].sort()).toEqual([...raw].sort())
    expect(terms).toEqual(raw.slice(0, terms.length))
  })

  it('reports terms beyond the 100-term cap as excluded', () => {
    const raw = Array.from({ length: 130 }, (_, i) => `${i}`)
    const { terms, excluded } = normalizeGlossary(raw)
    expect(terms.length).toBeLessThanOrEqual(100)
    expect(terms.length + excluded.length).toBe(130)
  })
})

describe('packResume', () => {
  it('returns null for empty or whitespace text', () => {
    expect(packResume({ company: 'Acme', resume: { name: 'cv', text: '' } })).toBeNull()
    expect(packResume({ company: 'Acme', resume: { name: 'cv', text: '  \n ' } })).toBeNull()
    expect(packResume({ company: 'Acme', resume: null })).toBeNull()
  })

  it('names a nameless resume after the company', () => {
    expect(packResume({ company: 'Acme', resume: { name: '', text: 'body' } })).toEqual({
      name: 'Acme resume',
      text: 'body',
    })
  })

  it('keeps a supplied name', () => {
    expect(packResume({ company: 'Acme', resume: { name: 'My CV', text: 'body' } })?.name).toBe(
      'My CV',
    )
  })
})

describe('mapPack', () => {
  it('maps a thin pack to empty fields with all judgement fields missing', () => {
    const r = mapPack(makePack())
    expect(r.fields).toEqual({
      companyInfo: '',
      projectScope: '',
      notes: '',
      talkingPoints: '',
      persona: '',
    })
    expect(r.glossary).toEqual([])
    expect(r.resume).toBeNull()
    expect(r.missing).toEqual(['companyInfo', 'talkingPoints', 'persona', 'glossary'])
    expect(r.sources).toEqual({})
  })

  it('marks supplied judgement fields as resumes and not missing', () => {
    const r = mapPack(
      makePack({
        companyInfo: 'About Acme',
        talkingPoints: '- a',
        persona: 'calm',
        glossary: ['Rust'],
      }),
    )
    expect(r.missing).toEqual([])
    expect(r.sources).toEqual({
      companyInfo: 'resumes',
      talkingPoints: 'resumes',
      persona: 'resumes',
      glossary: 'resumes',
    })
    expect(r.fields.companyInfo).toBe('About Acme')
    expect(r.glossary).toEqual(['Rust'])
  })

  it('marks only the supplied ones when partially populated', () => {
    const r = mapPack(makePack({ persona: 'calm' }))
    expect(r.sources).toEqual({ persona: 'resumes' })
    expect(r.missing).toEqual(['companyInfo', 'talkingPoints', 'glossary'])
  })

  it('treats a glossary that normalizes to nothing as missing', () => {
    const r = mapPack(makePack({ glossary: ['  ', ''] }))
    expect(r.missing).toContain('glossary')
  })

  it('maps a 20,000-char persona intact', () => {
    const persona = 'p'.repeat(20_000)
    expect(mapPack(makePack({ persona })).fields.persona).toBe(persona)
  })

  it('keeps the resume separate from every other field', () => {
    const secret = 'RESUME-ONLY-SECRET-TEXT'
    const r = mapPack(
      makePack({
        notes: 'verified facts',
        projectScope: 'scope',
        jdUrl: 'https://example.com/job',
        resume: { name: 'cv', text: secret },
      }),
    )
    expect(r.resume).toEqual({ name: 'cv', text: secret })
    expect(JSON.stringify({ ...r, resume: null })).not.toContain(secret)
    expect(r.fields.notes).toBe('verified facts')
  })

  it('does not append company, role or jdUrl to notes', () => {
    const r = mapPack(
      makePack({
        notes: 'just notes',
        company: 'Acme',
        role: 'Engineer',
        jdUrl: 'https://example.com/job',
      }),
    )
    expect(r.fields.notes).toBe('just notes')
    expect(JSON.stringify(r.fields)).not.toContain('example.com')
    expect(JSON.stringify(r.fields)).not.toContain('Engineer')
  })

  it('reports excluded glossary terms', () => {
    const long = 'y'.repeat(150)
    const r = mapPack(makePack({ glossary: ['Go', long] }))
    expect(r.glossary).toEqual(['Go'])
    expect(r.glossaryExcluded).toEqual([long])
  })
})
