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

it('the shipped pre-commit hook runs lint-staged, then the full typecheck when TypeScript is staged', () => {
  const hook = readFileSync(join(__dirname, 'pre-commit.sh'), 'utf8')
  expect(hook).toContain('npx --no-install lint-staged')
  expect(hook).toContain('git diff --cached --name-only')
  expect(hook).toContain('SANAS_SKIP_TYPECHECK')
})

it('the pre-commit hook refuses unstaged or untracked TypeScript, then runs the fast working-tree typecheck (915bd31)', () => {
  const hook = readFileSync(join(__dirname, 'pre-commit.sh'), 'utf8')
  expect(hook).toContain("git diff --name-only --diff-filter=ACMRD -- '*.ts' '*.tsx'")
  expect(hook).toContain("git ls-files --others --exclude-standard -- '*.ts' '*.tsx'")
  expect(hook).toContain('so the typechecked tree equals the commit')
  expect(hook).toContain('npm run --silent typecheck')
  expect(hook.indexOf('exit 1')).toBeLessThan(hook.indexOf('npm run --silent typecheck'))
  expect(hook).not.toContain('typecheck-staged')
})
