import { expect, it } from 'vitest'
import { assertDatabaseHealthy } from './integrity'

const reader = (quick: unknown, fk: unknown) => ({
  pragma: (q: string) => (q === 'quick_check' ? quick : fk),
})

it('passes a healthy database', () => {
  expect(() => assertDatabaseHealthy(reader([{ quick_check: 'ok' }], []))).not.toThrow()
})

it('refuses structural damage without repairing', () => {
  expect(() =>
    assertDatabaseHealthy(reader([{ quick_check: 'database disk image is malformed' }], [])),
  ).toThrow(/malformed.*did not migrate or modify/s)
})

it('refuses foreign-key violations', () => {
  expect(() =>
    assertDatabaseHealthy(reader([{ quick_check: 'ok' }], [{ table: 'segments' }])),
  ).toThrow(/1 foreign-key violation/)
})
