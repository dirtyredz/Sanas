import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const script = readFileSync(join(__dirname, '../../../scripts/release/smoke.ps1'), 'utf8')

it('smoke.ps1 compares against the build-reported schema version, not a literal', () => {
  expect(script).not.toMatch(/schemaVersion\s+-(ne|eq)\s+\d/i)
  expect(script).toMatch(/schemaVersion -ne \$result\.expectedSchemaVersion/)
})
