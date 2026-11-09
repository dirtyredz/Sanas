// Runs `npm run typecheck` against the STAGED tree (the git index), not the working tree. Called by scripts/pre-commit.sh.
//
// Why: a plain typecheck in the hook sees whatever is on disk, so a commit whose index is broken but whose working tree
// is fixed (an import edit left unstaged after `git mv`, or `git commit <paths>`) passed the hook and landed broken (915bd31).
// We export the index to a temp dir, link the repo's node_modules into it, and typecheck that.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, symlinkSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, parse } from 'node:path'

const repo = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim()
if (!repo) {
  console.error('typecheck-staged: not inside a git checkout')
  process.exit(1)
}

// A worktree under <repo>/.claude/worktrees has no node_modules of its own; Node resolves the ancestor's, so do we.
// Match on typescript being installed: tools (vitest's .vite cache) leave a hollow node_modules behind.
function findNodeModules(from) {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'node_modules', 'typescript'))) return join(dir, 'node_modules')
    if (dir === parse(dir).root) return null
  }
}

const nodeModules = findNodeModules(repo)
if (!nodeModules) {
  console.error('typecheck-staged: no node_modules found; run npm install')
  process.exit(1)
}

const tmp = mkdtempSync(join(tmpdir(), 'sanas-staged-typecheck-'))
let status = 1
try {
  const prefix = `${tmp.replaceAll('\\', '/')}/`
  const exported = spawnSync('git', ['checkout-index', '-a', `--prefix=${prefix}`], {
    cwd: repo,
    stdio: 'inherit',
  })
  if (exported.status !== 0) throw new Error('git checkout-index failed')
  symlinkSync(nodeModules, join(tmp, 'node_modules'), 'junction')
  const result = spawnSync('npm', ['run', '--silent', 'typecheck'], {
    cwd: tmp,
    stdio: 'inherit',
    shell: true,
  })
  status = result.status ?? 1
} catch (error) {
  console.error(`typecheck-staged: ${error.message}`)
} finally {
  try {
    unlinkSync(join(tmp, 'node_modules')) // unlink the link itself; never recurse into the real node_modules
  } catch {
    // link was never created
  }
  rmSync(tmp, { recursive: true, force: true })
}
process.exit(status)
