import { describe, expect, it } from 'vitest'
import { mapPack } from '../map-pack'
import { validatePack } from './validate-pack'

// Contract check against the shape the resumes project really writes (verified 2026-11-06
// against its six job-hunt/sanas/*.json files). Synthetic content, real shape: null jdUrl and
// resume on a closed pack, an extra `resume.selection`, a Windows `pdfPath`, 64-hex contentHash,
// `fieldSources` with the "prep" label, and null judgement fields.

const HASH = 'a'.repeat(64)

const interviewPack = {
  schemaVersion: 1,
  applicationId: 'acme',
  stage: 'interview',
  updatedAt: '2026-11-06T21:06:45.307Z',
  contentHash: HASH,
  company: 'Acme',
  role: 'Software Engineer (TypeScript)',
  projectScope: 'Scope text.\r\nSecond line.',
  jdUrl: 'https://www.linkedin.com/jobs/view/123/',
  notes: 'Master facts.\n- one\n- two',
  resume: {
    name: 'Acme - resume sent (Resume_Acme.pdf)',
    selection: 'sent',
    text: 'Resume body',
    pdfPath: 'C:/Users/someone/resumes/Resume_Acme.pdf',
  },
  companyInfo: 'Company info',
  talkingPoints: 'Points',
  persona: 'Persona',
  glossary: ['TypeScript', 'Node.js', 'typescript'],
  fieldSources: { companyInfo: 'prep', talkingPoints: 'prep', persona: 'prep', glossary: 'prep' },
}

const closedPack = {
  ...interviewPack,
  applicationId: 'beta',
  stage: 'closed',
  jdUrl: null,
  resume: null,
  companyInfo: null,
  talkingPoints: null,
  persona: null,
  glossary: null,
  fieldSources: { companyInfo: null, talkingPoints: null, persona: null, glossary: null },
}

describe('real resumes pack shape', () => {
  it('accepts a full interview pack and maps every judgement field to the resumes source', () => {
    const v = validatePack(interviewPack, 'acme')
    expect(v).toMatchObject({ ok: true })
    if (!v.ok) return
    expect(v.pack.stage).toBe('interview')
    expect(v.pack.resume).toEqual({ name: interviewPack.resume.name, text: 'Resume body' })
    const m = mapPack(v.pack)
    expect(m.missing).toEqual([])
    expect(m.sources.glossary).toBe('resumes')
    expect(m.glossary).toEqual(['TypeScript', 'Node.js'])
  })

  it('accepts a closed pack with null jdUrl, resume and judgement fields', () => {
    const v = validatePack(closedPack, 'beta')
    expect(v).toMatchObject({ ok: true })
    if (!v.ok) return
    expect(v.pack.jdUrl).toBe('')
    expect(v.pack.resume).toBeNull()
    expect(mapPack(v.pack).missing).toEqual(['companyInfo', 'talkingPoints', 'persona', 'glossary'])
  })
})
