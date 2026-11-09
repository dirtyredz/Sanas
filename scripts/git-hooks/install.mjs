// Installs this repo's git hooks into Git's resolved hooks directory. Wired to `prepare`, so a fresh clone sets itself up
// on `npm install` with nothing to remember. No-ops outside a git checkout (CI tarballs, npx installs).
//
// Copies rather than symlinks: Windows needs a privilege or developer mode for symlinks, and a copy
// is what git actually executes anyway. Re-run `npm run prepare` after editing a hook source.
import { execFileSync } from 'node:child_process'
import { copyFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
    const src = join(repo, 'scripts', 'git-hooks', `${name}.sh`)
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  installGitHooks(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))
