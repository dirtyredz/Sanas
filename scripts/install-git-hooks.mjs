// Installs this repo's git hooks into .git/hooks. Wired to `prepare`, so a fresh clone sets itself up
// on `npm install` with nothing to remember. No-ops outside a git checkout (CI tarballs, npx installs).
//
// Copies rather than symlinks: Windows needs a privilege or developer mode for symlinks, and a copy
// is what git actually executes anyway. Re-run `npm run prepare` after editing a hook source.
import { copyFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = dirname(dirname(fileURLToPath(import.meta.url)))
const gitDir = join(repo, '.git')
if (!existsSync(gitDir)) {
  console.log('install-git-hooks: no .git here, skipping')
  process.exit(0)
}

const hooksDir = join(gitDir, 'hooks')
mkdirSync(hooksDir, { recursive: true })

for (const name of ['pre-commit']) {
  const src = join(repo, 'scripts', `${name}.sh`)
  const dest = join(hooksDir, name)
  if (!existsSync(src)) continue
  // Don't clobber an unrelated hook someone installed by hand.
  if (existsSync(dest) && !readFileSync(dest, 'utf8').includes('lint-staged')) {
    console.log(`install-git-hooks: ${name} already exists and isn't ours — leaving it alone`)
    continue
  }
  copyFileSync(src, dest)
  chmodSync(dest, 0o755)
  console.log(`install-git-hooks: installed ${name}`)
}
