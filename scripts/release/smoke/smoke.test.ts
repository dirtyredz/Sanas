import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const script = readFileSync(join(__dirname, 'smoke.ps1'), 'utf8')

// expectedSchemaVersion comes from the build's db/migrations (smoke.ts); smoke.ps1 must compare against
// it rather than hardcode a version, so the two change together without editing the script.
it('smoke.ps1 compares against the build-reported schema version, not a literal', () => {
  const literal = /\w*schemaVersion\s+-(ne|eq|lt|le|gt|ge)\s+\d+/gi
  const offenders = [...script.matchAll(literal)]
    .map((m) => m[0])
    .filter((text) => !/^expectedSchemaVersion\s+-lt\s+1$/i.test(text))
  expect(offenders).toEqual([])
  expect(script).toMatch(/schemaVersion -ne \$result\.expectedSchemaVersion/)
})
