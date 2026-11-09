import { expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nextVersion, publishedReleases, stamp } from './version.mjs'
it('allocates numerically above all published canonical tags, including prereleases', () => {
  expect(nextVersion([])).toBe('0.1.1')
  expect(
    nextVersion([
      { tag_name: 'v0.9.99' },
      { tag_name: 'v0.10.2', prerelease: true },
      { tag_name: 'v9.0.0', draft: true },
      { tag_name: 'v01.2.3' },
      { tag_name: 'v1.0.0-rc.1' },
    ]),
  ).toBe('0.10.3')
})
it('follows all pages, excludes drafts and fails closed on incomplete discovery', async () => {
  const api = vi
    .fn()
    .mockResolvedValueOnce(Array.from({ length: 100 }, () => ({ tag_name: 'v0.1.1' })))
    .mockResolvedValueOnce([{ tag_name: 'v0.2.0' }, { draft: true }])
  expect(nextVersion(await publishedReleases(api))).toBe('0.2.1')
  expect(api).toHaveBeenLastCalledWith('/releases?per_page=100&page=2')
  await expect(publishedReleases(async () => null)).rejects.toThrow('Incomplete')
  await expect(
    publishedReleases(async () => {
      throw new Error('offline')
    }),
  ).rejects.toThrow('offline')
})
it('stamps all three version fields in the supplied checkout only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sanas-version-'))
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '0.1.0' }))
    writeFileSync(
      join(dir, 'package-lock.json'),
      JSON.stringify({ version: '0.1.0', packages: { '': { version: '0.1.0' } } }),
    )
    stamp('0.2.3', dir)
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version).toBe('0.2.3')
    const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'))
    expect(lock.version).toBe('0.2.3')
    expect(lock.packages[''].version).toBe('0.2.3')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
