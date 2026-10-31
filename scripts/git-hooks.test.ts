import { afterEach, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installGitHooks } from './git-hooks.mjs'

const dirs: string[] = []
function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sanas-git-hooks-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

it('keeps the no-.git checkout skip', () => {
  const log = vi.fn()
  expect(installGitHooks(tempRepo(), vi.fn(), log)).toBe(false)
  expect(log).toHaveBeenCalledWith('install-git-hooks: no .git here, skipping')
})

it('installs into the hooks directory resolved by Git for a linked worktree', () => {
  const repo = tempRepo()
  const hooks = join(tempRepo(), 'hooks')
  writeFileSync(join(repo, '.git'), 'gitdir: C:/shared/worktrees/test')
  const scripts = join(repo, 'scripts')
  mkdirSync(scripts)
  writeFileSync(join(scripts, 'pre-commit.sh'), '#!/bin/sh\nnpx lint-staged\n')
  expect(installGitHooks(repo, () => hooks, vi.fn())).toBe(true)
  expect(existsSync(join(hooks, 'pre-commit'))).toBe(true)
  expect(readFileSync(join(hooks, 'pre-commit'), 'utf8')).toContain('lint-staged')
})
