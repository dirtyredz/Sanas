import { execFile as nodeExecFile, type ExecFileException } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { SourceConfig } from './source-config'

// Asks the resumes project to regenerate its interview packs by running its own command:
// `<node> <root>/_hunt/cli/sanas-packs.js --json` (one file per command). The command owns
// generation and its lock; Sanas only starts it with a fixed argv, no shell, a bounded
// lifetime and output, and an environment without provider credentials. Its stdout is never
// the source of pack contents (Sanas reads the pack files afterwards), and its output is
// never shown raw: failures become a short reason.

export const PACK_SCRIPT = ['_hunt', 'cli', 'sanas-packs.js'] as const
export const REFRESH_TIMEOUT_MS = 30_000
export const REFRESH_MAX_OUTPUT_BYTES = 256 * 1024
const REASON_MAX_CHARS = 160
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g

export type RefreshOutcome = { ok: true } | { ok: false; reason: string }

export type ExecFileFn = (
  file: string,
  args: readonly string[],
  options: {
    cwd: string
    shell: false
    windowsHide: true
    timeout: number
    maxBuffer: number
    env: NodeJS.ProcessEnv
  },
  callback: (error: ExecFileException | null, stdout: string, stderr: string) => void,
) => unknown

const SECRET_ENV =
  /(ANTHROPIC|DEEPGRAM|OPENAI|CLAUDE|API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASSWD|SMTP|CREDENTIAL|^OP_|ELECTRON_RUN_AS_NODE|NODE_OPTIONS)/i

/** The parent environment minus anything that looks like a credential or changes how Node
 *  starts. */
export function childEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !SECRET_ENV.test(key)))
}

/** One printable line, bounded: the producer reports failures as a single stderr line. */
function firstLine(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? ''
  return line.replace(CONTROL, '').trim().slice(0, REASON_MAX_CHARS)
}

function failure(error: ExecFileException, stderr: string, node: string): string {
  if (error.code === 'ENOENT') return `Node was not found (${node}).`
  if (error.code === 'EACCES' || error.code === 'EPERM') return 'Node could not be started.'
  if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
    return 'The pack command produced too much output.'
  if (error.killed || error.signal)
    return `The pack command did not finish within ${REFRESH_TIMEOUT_MS / 1000} seconds.`
  const line = firstLine(stderr)
  const exit = typeof error.code === 'number' ? `exited with code ${error.code}` : 'failed'
  return line ? `The pack command ${exit}: ${line}` : `The pack command ${exit}.`
}

export async function runPackRefresh(
  config: SourceConfig,
  execFile: ExecFileFn = nodeExecFile as unknown as ExecFileFn,
): Promise<RefreshOutcome> {
  const script = join(config.root, ...PACK_SCRIPT)
  try {
    if (!(await stat(script)).isFile()) throw new Error('not a file')
  } catch {
    return { ok: false, reason: `The resumes pack command is missing (${PACK_SCRIPT.join('/')}).` }
  }
  return new Promise((resolve) => {
    try {
      execFile(
        config.node,
        [script, '--json'],
        {
          cwd: config.root,
          shell: false,
          windowsHide: true,
          timeout: REFRESH_TIMEOUT_MS,
          maxBuffer: REFRESH_MAX_OUTPUT_BYTES,
          env: childEnvironment(process.env),
        },
        (error, _stdout, stderr) =>
          resolve(
            error
              ? { ok: false, reason: failure(error, String(stderr ?? ''), config.node) }
              : { ok: true },
          ),
      )
    } catch {
      resolve({ ok: false, reason: 'Node could not be started.' })
    }
  })
}

const inFlight = new Map<string, Promise<RefreshOutcome>>()

/** Concurrent refreshes of the same configuration share one run. */
export function refreshPacks(
  config: SourceConfig,
  run: (config: SourceConfig) => Promise<RefreshOutcome> = runPackRefresh,
): Promise<RefreshOutcome> {
  const existing = inFlight.get(config.key)
  if (existing) return existing
  const pending = run(config).finally(() => inFlight.delete(config.key))
  inFlight.set(config.key, pending)
  return pending
}
