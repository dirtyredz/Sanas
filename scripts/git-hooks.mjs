import { execFileSync } from 'node:child_process'
import { copyFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

export function gitHooksDir(repo) {
  const value = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
  if (!value) throw new Error('git returned an empty hooks path')
  return isAbsolute(value) ? value : resolve(repo, value)
}

export function installGitHooks(repo, resolveHooks = gitHooksDir, log = console.log) {
  if (!existsSync(join(repo, '.git'))) {
    log('install-git-hooks: no .git here, skipping')
    return false
  }

  let hooksDir
  try {
    hooksDir = resolveHooks(repo)
  } catch {
    log('install-git-hooks: could not resolve the Git hooks directory, skipping')
    return false
  }
  mkdirSync(hooksDir, { recursive: true })

  for (const name of ['pre-commit']) {
    const src = join(repo, 'scripts', `${name}.sh`)
    const dest = join(hooksDir, name)
    if (!existsSync(src)) continue
    // Don't clobber an unrelated hook someone installed by hand.
    if (existsSync(dest) && !readFileSync(dest, 'utf8').includes('lint-staged')) {
      log(`install-git-hooks: ${name} already exists and isn't ours — leaving it alone`)
      continue
    }
    copyFileSync(src, dest)
    chmodSync(dest, 0o755)
    log(`install-git-hooks: installed ${name}`)
  }
  return true
}
