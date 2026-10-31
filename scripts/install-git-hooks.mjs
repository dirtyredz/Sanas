// Installs this repo's git hooks into Git's resolved hooks directory. Wired to `prepare`, so a fresh clone sets itself up
// on `npm install` with nothing to remember. No-ops outside a git checkout (CI tarballs, npx installs).
//
// Copies rather than symlinks: Windows needs a privilege or developer mode for symlinks, and a copy
// is what git actually executes anyway. Re-run `npm run prepare` after editing a hook source.
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installGitHooks } from './git-hooks.mjs'

const repo = dirname(dirname(fileURLToPath(import.meta.url)))
installGitHooks(repo)
