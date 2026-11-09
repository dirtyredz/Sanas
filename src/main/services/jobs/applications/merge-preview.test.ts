import { describe, expect, it, vi } from 'vitest'

// The repo module only needs the DB for its query functions; keep electron out of the test.
vi.mock('../../../db/index', () => ({ getDb: vi.fn() }))

import type { ImportBaseline, LocalValues } from '@shared/jobs/import-baseline'
import { emptyBaseline } from '../../../db/repos/job/applications'
import type { SourceValues } from './map-pack'
import { nextBaseline, planRefresh, resolveRefresh, threeWay, type PlanItem } from './merge-preview'

const eq = (a: string, b: string): boolean => a === b

function baseline(over: Partial<ImportBaseline> = {}): ImportBaseline {
  return { ...emptyBaseline(), ...over }
}

function incomingValues(over: Partial<SourceValues> = {}): SourceValues {
  return {
    fields: { companyInfo: '', projectScope: '', notes: '', talkingPoints: '', persona: '' },
    glossary: [],
    glossaryExcluded: [],
    resume: null,
    sources: {},
    missing: [],
    ...over,
  }
}

function localValues(over: Partial<LocalValues> = {}): LocalValues {
  return {
    fields: { companyInfo: '', projectScope: '', notes: '', talkingPoints: '', persona: '' },
    glossary: [],
    resume: null,
    ...over,
  }
}

const outcomeOf = (plan: PlanItem[], key: PlanItem['key']) =>
  plan.find((p) => p.key === key)?.outcome

describe('threeWay', () => {
  it('all equal is unchanged', () => expect(threeWay('a', 'a', 'a', eq)).toBe('unchanged'))
  it('local equals incoming but not base is unchanged', () =>
    expect(threeWay('a', 'b', 'b', eq)).toBe('unchanged'))
  it('local equals base takes incoming', () => expect(threeWay('a', 'a', 'b', eq)).toBe('incoming'))
  it('incoming equals base keeps local', () =>
    expect(threeWay('a', 'b', 'a', eq)).toBe('keep-local'))
  it('all differ is a conflict', () => expect(threeWay('a', 'b', 'c', eq)).toBe('conflict'))
})

describe('planRefresh', () => {
  it('plans every field, glossary and resume', () => {
    const plan = planRefresh(baseline(), localValues(), incomingValues())
    expect(plan.map((p) => p.key)).toEqual([
      'companyInfo',
      'projectScope',
      'notes',
      'talkingPoints',
      'persona',
      'glossary',
      'resume',
    ])
    expect(plan.every((p) => p.outcome === 'unchanged')).toBe(true)
  })

  it('clearing at the source takes the incoming empty value', () => {
    const b = baseline()
    b.fields.notes = 'old'
    const l = localValues()
    l.fields.notes = 'old'
    const plan = planRefresh(b, l, incomingValues())
    expect(outcomeOf(plan, 'notes')).toBe('incoming')
  })

  it('a local glossary note turns an incoming change into a conflict', () => {
    const plan = planRefresh(
      baseline({ glossary: ['A'] }),
      localValues({ glossary: [{ term: 'A', note: 'my note' }] }),
      incomingValues({ glossary: ['A', 'B'] }),
    )
    expect(outcomeOf(plan, 'glossary')).toBe('conflict')
  })

  it('a local glossary note with an unchanged incoming keeps local', () => {
    const plan = planRefresh(
      baseline({ glossary: ['A'] }),
      localValues({ glossary: [{ term: 'A', note: 'my note' }] }),
      incomingValues({ glossary: ['A'] }),
    )
    expect(outcomeOf(plan, 'glossary')).toBe('keep-local')
  })

  it('glossary comparison ignores case and order', () => {
    const plan = planRefresh(
      baseline({ glossary: ['Alpha', 'Beta'] }),
      localValues({
        glossary: [
          { term: 'beta', note: '' },
          { term: 'ALPHA', note: '' },
        ],
      }),
      incomingValues({ glossary: ['Beta', 'Alpha'] }),
    )
    expect(outcomeOf(plan, 'glossary')).toBe('unchanged')
  })

  it('takes an incoming glossary change when local is untouched', () => {
    const plan = planRefresh(
      baseline({ glossary: ['A'] }),
      localValues({ glossary: [{ term: 'a', note: '' }] }),
      incomingValues({ glossary: ['A', 'B'] }),
    )
    expect(outcomeOf(plan, 'glossary')).toBe('incoming')
  })

  it('treats the resume as one unit: a name-only change counts', () => {
    const r = { name: 'cv', text: 'body' }
    const plan = planRefresh(
      baseline({ resume: r }),
      localValues({ resume: { ...r } }),
      incomingValues({ resume: { name: 'cv2', text: 'body' } }),
    )
    expect(outcomeOf(plan, 'resume')).toBe('incoming')
  })

  it('equal resumes by value are unchanged', () => {
    const plan = planRefresh(
      baseline({ resume: { name: 'a', text: 'b' } }),
      localValues({ resume: { name: 'a', text: 'b' } }),
      incomingValues({ resume: { name: 'a', text: 'b' } }),
    )
    expect(outcomeOf(plan, 'resume')).toBe('unchanged')
  })

  it('keeps a drafted field while the source stays empty', () => {
    const b = baseline({ sources: { persona: 'drafted' } })
    const l = localValues()
    l.fields.persona = 'drafted text'
    const plan = planRefresh(b, l, incomingValues())
    expect(outcomeOf(plan, 'persona')).toBe('keep-local')
  })

  it('a drafted field conflicts once the source supplies a value', () => {
    const b = baseline({ sources: { persona: 'drafted' } })
    const l = localValues()
    l.fields.persona = 'drafted text'
    const inc = incomingValues()
    inc.fields.persona = 'real persona'
    expect(outcomeOf(planRefresh(b, l, inc), 'persona')).toBe('conflict')
  })
})

describe('resolveRefresh', () => {
  const inc = incomingValues({
    fields: {
      companyInfo: 'info',
      projectScope: '',
      notes: 'new notes',
      talkingPoints: '',
      persona: 'persona',
    },
    glossary: ['X'],
    resume: null,
    sources: { companyInfo: 'resumes', persona: 'resumes', glossary: 'resumes' },
  })

  it('keeps local for conflicts by default', () => {
    const r = resolveRefresh([{ key: 'notes', outcome: 'conflict' }], inc, {})
    expect(r.fields).toEqual({})
  })

  it('takes incoming for a conflict when chosen', () => {
    const r = resolveRefresh(
      [{ key: 'notes', outcome: 'conflict' }],
      inc,
      {},
      { notes: 'incoming' },
    )
    expect(r.fields).toEqual({ notes: 'new notes' })
  })

  it('an explicit keep choice keeps local', () => {
    const r = resolveRefresh([{ key: 'notes', outcome: 'conflict' }], inc, {}, { notes: 'keep' })
    expect(r.fields).toEqual({})
  })

  it('always applies incoming outcomes and omits untouched keys', () => {
    const r = resolveRefresh(
      [
        { key: 'notes', outcome: 'incoming' },
        { key: 'projectScope', outcome: 'unchanged' },
        { key: 'talkingPoints', outcome: 'keep-local' },
      ],
      inc,
      {},
    )
    expect(r.fields).toEqual({ notes: 'new notes' })
    expect('glossary' in r).toBe(false)
    expect('resume' in r).toBe(false)
  })

  it('applies a null resume as a removal and replaces the glossary', () => {
    const r = resolveRefresh(
      [
        { key: 'resume', outcome: 'incoming' },
        { key: 'glossary', outcome: 'incoming' },
      ],
      inc,
      {},
    )
    expect(r.resume).toBeNull()
    expect('resume' in r).toBe(true)
    expect(r.glossary).toEqual(['X'])
  })

  it('sets resumes source for a supplied judgement field', () => {
    const r = resolveRefresh([{ key: 'companyInfo', outcome: 'incoming' }], inc, {
      companyInfo: 'drafted',
    })
    expect(r.sources.companyInfo).toBe('resumes')
  })

  it('deletes the source key when the incoming judgement field is empty', () => {
    const r = resolveRefresh([{ key: 'talkingPoints', outcome: 'incoming' }], inc, {
      talkingPoints: 'resumes',
    })
    expect('talkingPoints' in r.sources).toBe(false)
  })

  it('keeps drafted sources for fields that stay local', () => {
    const r = resolveRefresh([{ key: 'persona', outcome: 'keep-local' }], inc, {
      persona: 'drafted',
    })
    expect(r.sources.persona).toBe('drafted')
  })

  it('does not mutate the previous sources', () => {
    const prev = { talkingPoints: 'resumes' as const }
    resolveRefresh([{ key: 'talkingPoints', outcome: 'incoming' }], inc, prev)
    expect(prev).toEqual({ talkingPoints: 'resumes' })
  })
})

describe('nextBaseline', () => {
  it('copies incoming values with the given sources at version 1', () => {
    const inc = incomingValues({
      glossary: ['A'],
      resume: { name: 'n', text: 't' },
    })
    inc.fields.notes = 'n'
    const b = nextBaseline(inc, { persona: 'drafted' })
    expect(b).toEqual({
      version: 1,
      fields: inc.fields,
      glossary: ['A'],
      resume: { name: 'n', text: 't' },
      sources: { persona: 'drafted' },
    })
    expect(b.fields).not.toBe(inc.fields)
    expect(b.glossary).not.toBe(inc.glossary)
  })
})
