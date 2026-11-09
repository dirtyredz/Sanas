import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
const root = fileURLToPath(new URL('../../../', import.meta.url))
await build({
  entryPoints: [resolve(root, 'src/main/diagnostics/rehearsal/runner/history-latency.ts')],
  outfile: resolve(root, 'out/main/chunks/history-latency.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  alias: { '@shared': resolve(root, 'src/shared') },
})
const result = spawnSync(
  resolve(root, 'node_modules/electron/dist/electron.exe'),
  [resolve(root, 'out/main/chunks/history-latency.cjs'), resolve(root, '.tmp/history-latency')],
  { cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit' },
)
process.exitCode = result.status ?? 1
