import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('../../../../config/settings', () => ({ loadSettings: () => ({}) }))
import { resolveSourceConfig } from './source-config'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sanas-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const settings = (resumesRoot: string, resumesNodeExecutable = 'node.exe') => ({
  resumesRoot,
  resumesNodeExecutable,
})

async function failure(value: {
  resumesRoot: string
  resumesNodeExecutable: string
}): Promise<string> {
  const result = await resolveSourceConfig(value)
  if (result.ok) throw new Error('expected a failure')
  return result.message
}

it('accepts an existing absolute directory and canonicalizes it', async () => {
  const result = await resolveSourceConfig(settings(dir))
  if (!result.ok) throw new Error(result.message)
  expect(result.config.root).toBe(realpathSync(dir))
  expect(result.config.node).toBe('node.exe')
  expect(result.config.key).toContain(result.config.root)
  expect(result.config.key).toContain('node.exe')
})

it('rejects a relative path', async () => {
  expect(await failure(settings('relative/dir'))).toMatch(/^Resumes folder: .*absolute/)
})

it('rejects a UNC path', async () => {
  expect(await failure(settings('\\\\server\\share\\resumes'))).toMatch(
    /^Resumes folder: .*local path/,
  )
})

it('rejects an absolute path that does not exist', async () => {
  const missing = join(dir, 'does-not-exist')
  expect(await failure(settings(missing))).toBe(
    'The resumes folder does not exist or is not a folder.',
  )
})

it('rejects a file where a directory is expected', async () => {
  const file = join(dir, 'file.txt')
  writeFileSync(file, 'x')
  expect(await failure(settings(file))).toBe(
    'The resumes folder does not exist or is not a folder.',
  )
})

it('rejects invalid node executables', async () => {
  for (const node of ['', 'node ', 'C:\\x\\..\\node.exe']) {
    expect(await failure(settings(dir, node)), JSON.stringify(node)).toMatch(/^Node executable: /)
  }
})

it('accepts an absolute node path', async () => {
  const node =
    process.platform === 'win32' ? 'C:\\Program Files\\nodejs\\node.exe' : '/usr/bin/node'
  const result = await resolveSourceConfig(settings(dir, node))
  expect(result.ok).toBe(true)
})
