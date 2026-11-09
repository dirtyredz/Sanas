import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { releaseRepo } from './repo.mjs'

it('reads the release repo from the real electron-builder.yml publish block', () => {
  expect(releaseRepo().slug).toBe('dirtyredz/Sanas')
})

it('refuses a publish block that does not name a github owner and repo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sanas-repo-'))
  try {
    const file = join(dir, 'electron-builder.yml')
    writeFileSync(file, 'publish:\n  provider: generic\n')
    expect(() => releaseRepo(file)).toThrow(/github owner and repo/)
    writeFileSync(file, 'publish:\n  provider: github\n  owner: a\n  repo: b\n')
    expect(releaseRepo(file)).toEqual({ owner: 'a', repo: 'b', slug: 'a/b' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
