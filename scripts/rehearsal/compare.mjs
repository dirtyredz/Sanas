import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
const folder = resolve(root, '.tmp/owner-runs')
await mkdir(folder, { recursive: true })
const bundle = resolve(folder, `comparison-${process.pid}.mjs`)
await build({
  entryPoints: [resolve(root, 'src/main/rehearsal/runner/comparison.ts')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  tsconfig: resolve(root, 'tsconfig.node.json'),
})
const { compareProfiles } = await import(pathToFileURL(bundle).href)
const report = await compareProfiles({ realProvider: process.argv.includes('--real-provider') })
const path = resolve(folder, `comparison-${Date.now()}-${process.pid}.json`)
await writeFile(path, JSON.stringify(report, null, 2))
console.log(
  `Matched samples: ${report.samples.length}; assistant: ${report.assistant}; report: ${path}`,
)
if (report.samples.some((s) => s.outcome !== 'done')) process.exitCode = 1
