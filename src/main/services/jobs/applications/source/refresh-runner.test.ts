import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('../../../../config/settings', () => ({ loadSettings: () => ({}) }))
import {
  childEnvironment,
  refreshPacks,
  runPackRefresh,
  type ExecFileFn,
  type RefreshOutcome,
} from './refresh-runner'
import type { SourceConfig } from './source-config'

type Callback = Parameters<ExecFileFn>[3]
type Call = { file: string; args: readonly string[]; options: Parameters<ExecFileFn>[2] }

let root: string
let config: SourceConfig
const savedEnv = { ...process.env }

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sanas-'))
  mkdirSync(join(root, '_hunt', 'cli'), { recursive: true })
  writeFileSync(join(root, '_hunt', 'cli', 'sanas-packs.js'), '// stub')
  config = { root, node: 'node.exe', key: `${root}\u0000node.exe` }
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key]
  Object.assign(process.env, savedEnv)
})

function fake(respond: (cb: Callback) => void) {
  const calls: Call[] = []
  const fn: ExecFileFn = (file, args, options, cb) => {
    calls.push({ file, args, options })
    respond(cb)
    return undefined
  }
  return { fn, calls }
}

const success = (cb: Callback) => cb(null, 'stdout secret', '')
const failWith =
  (error: Record<string, unknown>, stderr = '') =>
  (cb: Callback) =>
    cb(Object.assign(new Error('x'), error) as never, 'stdout secret', stderr)

function reason(outcome: RefreshOutcome): string {
  if (outcome.ok) throw new Error('expected failure')
  return outcome.reason
}

it('runs the pack script with fixed argv and bounded options', async () => {
  process.env.ANTHROPIC_API_KEY = 'a'
  process.env.DEEPGRAM_API_KEY = 'd'
  process.env.SOME_TOKEN = 't'
  process.env.NODE_OPTIONS = '--inspect'
  process.env.ELECTRON_RUN_AS_NODE = '1'
  const { fn, calls } = fake(success)
  expect(await runPackRefresh(config, fn)).toEqual({ ok: true })
  expect(calls).toHaveLength(1)
  const [call] = calls
  expect(call.file).toBe(config.node)
  expect(call.args).toEqual([join(root, '_hunt', 'cli', 'sanas-packs.js'), '--json'])
  expect(call.options).toMatchObject({
    shell: false,
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 256 * 1024,
    cwd: root,
  })
  const env = call.options.env
  expect(Object.keys(env).some((k) => k.toLowerCase() === 'path')).toBe(true)
  for (const key of [
    'ANTHROPIC_API_KEY',
    'DEEPGRAM_API_KEY',
    'SOME_TOKEN',
    'NODE_OPTIONS',
    'ELECTRON_RUN_AS_NODE',
  ]) {
    expect(env).not.toHaveProperty(key)
  }
})

it('childEnvironment keeps ordinary variables and drops credential-like ones', () => {
  const env = childEnvironment({
    PATH: 'p',
    HOME: 'h',
    OPENAI_KEY: 'k',
    MY_PASSWORD: 'x',
    OP_SESSION: 's',
  })
  expect(env).toEqual({ PATH: 'p', HOME: 'h' })
})

it('reports a missing script without running anything', async () => {
  rmSync(join(root, '_hunt'), { recursive: true, force: true })
  const { fn, calls } = fake(success)
  expect(reason(await runPackRefresh(config, fn))).toMatch(/missing/)
  expect(calls).toHaveLength(0)
})

it('explains ENOENT as Node not found', async () => {
  const { fn } = fake(failWith({ code: 'ENOENT' }))
  expect(reason(await runPackRefresh(config, fn))).toMatch(/Node was not found/)
})

it('explains a timeout kill', async () => {
  const { fn } = fake(failWith({ killed: true, signal: 'SIGTERM' }))
  expect(reason(await runPackRefresh(config, fn))).toMatch(/30 seconds/)
})

it('explains output overflow', async () => {
  const { fn } = fake(failWith({ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }))
  expect(reason(await runPackRefresh(config, fn))).toMatch(/too much output/)
})

it('reports exit code and only the first stderr line', async () => {
  const { fn } = fake(failWith({ code: 2 }, 'boom\nsecond line'))
  const text = reason(await runPackRefresh(config, fn))
  expect(text).toContain('code 2')
  expect(text).toContain('boom')
  expect(text).not.toContain('second line')
})

it('never puts stdout in a reason', async () => {
  const { fn } = fake(failWith({ code: 1 }, ''))
  expect(reason(await runPackRefresh(config, fn))).not.toContain('stdout secret')
})

it('turns a synchronous throw into a failure', async () => {
  const fn: ExecFileFn = () => {
    throw new Error('spawn exploded')
  }
  const outcome = await runPackRefresh(config, fn)
  expect(outcome.ok).toBe(false)
})

it('coalesces concurrent refreshes with the same key and runs again after settling', async () => {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const run = vi.fn(async (): Promise<RefreshOutcome> => {
    await gate
    return { ok: true }
  })
  const first = refreshPacks(config, run)
  const second = refreshPacks(config, run)
  expect(run).toHaveBeenCalledTimes(1)
  release()
  expect(await first).toEqual({ ok: true })
  expect(await second).toEqual({ ok: true })
  await refreshPacks(config, run)
  expect(run).toHaveBeenCalledTimes(2)
})
