import { expect, it } from 'vitest'
import { splitFiller, stripFillerMarkers } from './filler-marker'

it('strips markers to plain speakable text', () => {
  expect(stripFillerMarkers('I led ⟨a payments integration⟩ where ⟨I owned the API⟩.')).toBe(
    'I led a payments integration where I owned the API.',
  )
  expect(stripFillerMarkers('no markers')).toBe('no markers')
  expect(stripFillerMarkers('stray ⟩ and ⟨ open')).toBe('stray  and  open')
})

it('splits plain and filler runs, tolerating unbalanced markers', () => {
  expect(splitFiller('I led ⟨a payments job⟩ today')).toEqual([
    { text: 'I led ', filler: false },
    { text: 'a payments job', filler: true },
    { text: ' today', filler: false },
  ])
  expect(splitFiller('start ⟨streaming prefix')).toEqual([
    { text: 'start ', filler: false },
    { text: 'streaming prefix', filler: true },
  ])
  expect(splitFiller('a ⟩ b')).toEqual([
    { text: 'a ', filler: false },
    { text: ' b', filler: false },
  ])
  expect(splitFiller('⟨⟩')).toEqual([])
})
