import { expect, it } from 'vitest'
import { RunPublication } from './run-publication'

function gate(allowNoop: boolean): { gate: RunPublication; log: string[] } {
  const log: string[] = []
  const g = new RunPublication(true, allowNoop, {
    start: () => log.push('start'),
    delta: (t) => log.push(`delta:${t}`),
  })
  return { gate: g, log }
}

it('complete() starts a run that is still holding text, without replaying the held deltas', () => {
  const { gate: g, log } = gate(true)
  g.push('<no') // could still be the no-op: held
  expect(g.shown).toBe(false)
  g.complete()
  expect(g.shown).toBe(true)
  expect(log).toEqual(['start'])
})

it('complete() is a no-op once the run is already shown', () => {
  const { gate: g, log } = gate(false)
  g.push('Hello')
  g.complete()
  expect(log).toEqual(['start', 'delta:Hello'])
})
