import { expect, it } from 'vitest'
import { FIELD_LABELS, formatPreviewValue } from './preview-format'

it('formats typed preview values as display text', () => {
  expect(formatPreviewValue(null)).toBe('')
  expect(formatPreviewValue({ kind: 'text', text: 'Notes here' })).toBe('Notes here')
  expect(
    formatPreviewValue({
      kind: 'glossary',
      terms: [
        { term: 'Kafka', note: '' },
        { term: 'Camunda', note: 'workflow engine' },
      ],
    }),
  ).toBe('Kafka\nCamunda — workflow engine')
  expect(
    formatPreviewValue({ kind: 'resume', resume: { name: 'cv.md', text: 'Led a team.' } }),
  ).toBe('cv.md\n\nLed a team.')
  expect(formatPreviewValue({ kind: 'resume', resume: null })).toBe('')
})

it('labels every importable field', () => {
  expect(FIELD_LABELS.glossary).toBe('Glossary')
  expect(Object.keys(FIELD_LABELS)).toHaveLength(7)
})
