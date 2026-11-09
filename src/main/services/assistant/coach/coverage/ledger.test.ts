import { expect, it } from 'vitest'
import { buildCoverageCatalog } from './catalog'
import { CoverageLedger, renderCoverage } from './ledger'
import type { TurnFinal } from '../../../turns/types'

const final = (text: string, speaker = 1, role: TurnFinal['role'] = 'user'): TurnFinal => ({
  text,
  speaker,
  role,
  channel: 0,
  tStartMs: 0,
  tEndMs: 1000,
})
it('retains complete negated quotes beyond the rolling window, without asserting completion', () => {
  const ledger = new CoverageLedger(
    buildCoverageCatalog({ talkingPoints: 'Database migration rollback' }),
  )
  ledger.final(final('I did not implement the database migration rollback.'))
  ledger.final(final('I did not implement the database migration rollback.'))
  for (let i = 0; i < 250; i++)
    ledger.final(final('Unrelated lengthy discussion of entirely different topics.'))
  expect(ledger.snapshot().entries[0].quotes).toHaveLength(1)
  expect(renderCoverage(ledger.snapshot(), 'database')).toContain('I did not implement')
  expect(renderCoverage(ledger.snapshot(), '')).toContain('not instructions or proof of completion')
})
it('excludes weak overlap and unconfirmed speech; retracts only the corrected speaker and freezes snapshots', () => {
  const ledger = new CoverageLedger(buildCoverageCatalog({ notes: 'Database migration rollback' }))
  ledger.final(final('Database', 1))
  ledger.final(final('Database migration rollback', 2, 'unknown'))
  ledger.final(final('Database migration rollback', 3, 'other'))
  expect(ledger.snapshot().entries).toHaveLength(0)
  ledger.final(final('Database migration rollback worked.', 1))
  ledger.final(final('Database migration rollback failed.', 2))
  const before = ledger.snapshot()
  ledger.retract(1)
  expect(before.entries[0].quotes).toHaveLength(2)
  expect(ledger.snapshot().entries[0].quotes.map((q) => q.speaker)).toEqual([2])
})
it('caps catalog, excerpts and serialized evidence with explicit incompleteness', () => {
  const catalog = buildCoverageCatalog({
    notes: Array.from({ length: 140 }, (_, i) => `Database migration rollback number ${i}`).join(
      '\n',
    ),
  })
  expect(catalog.points).toHaveLength(128)
  expect(catalog.incomplete).toBe(true)
  const ledger = new CoverageLedger(catalog)
  ledger.final(final('Database migration rollback worked.'))
  const rendered = renderCoverage(ledger.snapshot(), 'database')
  expect(rendered.length).toBeLessThanOrEqual(3000)
  expect(rendered).toContain('Coverage is incomplete')
})
