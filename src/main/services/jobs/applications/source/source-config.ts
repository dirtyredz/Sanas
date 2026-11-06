import { realpath, stat } from 'node:fs/promises'
import { nodeExecutableProblem, resumesRootProblem } from '@shared/jobs/source-settings'
import { loadSettings } from '../../../../config/settings'

// The resumes integration settings, checked again at use time: persisted settings are not
// trusted just because the schema accepted them once. Only main resolves these paths.

export interface SourceConfig {
  /** Canonical absolute resumes folder. */
  root: string
  /** `node`/`node.exe` or an absolute path. */
  node: string
  /** Identity for coalescing refreshes and binding previews to this configuration. */
  key: string
}

export type SourceConfigResult = { ok: true; config: SourceConfig } | { ok: false; message: string }

export async function resolveSourceConfig(
  settings: { resumesRoot: string; resumesNodeExecutable: string } = loadSettings(),
): Promise<SourceConfigResult> {
  const rootProblem = resumesRootProblem(settings.resumesRoot)
  if (rootProblem) return { ok: false, message: `Resumes folder: ${rootProblem}` }
  const nodeProblem = nodeExecutableProblem(settings.resumesNodeExecutable)
  if (nodeProblem) return { ok: false, message: `Node executable: ${nodeProblem}` }
  let root: string
  try {
    root = await realpath(settings.resumesRoot)
    if (!(await stat(root)).isDirectory()) throw new Error('not a directory')
  } catch {
    return { ok: false, message: 'The resumes folder does not exist or is not a folder.' }
  }
  if (resumesRootProblem(root))
    return { ok: false, message: 'The resumes folder resolves to a network or device path.' }
  const node = settings.resumesNodeExecutable
  return { ok: true, config: { root, node, key: `${root}\u0000${node}` } }
}
