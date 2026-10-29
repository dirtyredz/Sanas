import { describe, expect, it } from 'vitest'
import { parseGlossaryInput } from './glossary-input'

describe('parseGlossaryInput', () => {
  it('splits supported list separators while preserving spaces within terms', () => {
    expect(
      parseGlossaryInput(
        'AS9 · NxA, NextAxiom; OLE\nBoomi\tApigee • writeback_change\nWork Package Creator',
      ),
    ).toEqual({
      terms: [
        'AS9',
        'NxA',
        'NextAxiom',
        'OLE',
        'Boomi',
        'Apigee',
        'writeback_change',
        'Work Package Creator',
      ],
      alreadyThere: 0,
    })
  })

  it('strips leading bullets and drops empty pieces', () => {
    expect(parseGlossaryInput('- Alpha\n* Beta\n• Gamma\n1. Delta\n2.\n, ;')).toEqual({
      terms: ['Alpha', 'Beta', 'Gamma', 'Delta'],
      alreadyThere: 0,
    })
  })

  it('skips existing terms and pasted duplicates case-insensitively', () => {
    expect(parseGlossaryInput('alpha, BETA, Alpha, gamma, GAMMA', ['Alpha', 'beta'])).toEqual({
      terms: ['gamma'],
      alreadyThere: 4,
    })
  })
})
