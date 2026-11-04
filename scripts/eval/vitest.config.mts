import { existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig, type Plugin } from 'vitest/config'

// Runs the paid prompt evals (*.eval.ts), never part of `npm test`. Two source trees are
// loaded side by side: the current src/ and an older copy extracted by topic-switch.ps1 into
// EVAL_OLD_ROOT. '@shared/…' must resolve inside whichever tree is importing it, which a
// global alias cannot do, so this plugin resolves it per importer.

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const oldRoot = process.env.EVAL_OLD_ROOT ? resolve(process.env.EVAL_OLD_ROOT) : null

function sharedPerTree(): Plugin {
  const norm = (p: string): string => p.replace(/\\/g, '/').toLowerCase()
  return {
    name: 'eval-shared-per-tree',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!source.startsWith('@shared/')) return null
      const inOld = oldRoot && importer && norm(importer).startsWith(norm(oldRoot))
      const base = join(inOld ? oldRoot : repo, 'src/shared', source.slice('@shared/'.length))
      for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')])
        if (existsSync(candidate)) return candidate
      return (await this.resolve(base, importer, { skipSelf: true }))?.id ?? null
    },
  }
}

export default defineConfig({
  root: repo,
  plugins: [sharedPerTree()],
  test: {
    include: ['scripts/eval/**/*.eval.ts'],
    testTimeout: 60 * 60_000,
    fileParallelism: false,
  },
})
