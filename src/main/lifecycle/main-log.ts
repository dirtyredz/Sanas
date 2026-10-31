import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { inspect } from 'node:util'
import { join } from 'node:path'

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024
const SENSITIVE_NAME = /(?:api[_-]?key|authorization|password|secret|settings|token)/i
const TOKEN_VALUE = /\b(?:sk-ant-|sk-|dg_)[A-Za-z0-9_-]{8,}\b/g
const SETTINGS_VALUE = /(settings\s*[:=]\s*)(?:\{[^}]*\}|\[[^\]]*\]|'[^']*'|"[^"]*"|[^\s,;}\]]+)/gi
const NAMED_VALUE =
  /((?:api[_-]?key|authorization|password|secret|settings|token)\s*[:=]\s*)(?:'[^']*'|"[^"]*"|[^\s,;}\]]+)/gi

export function redactLogText(value: string): string {
  return value
    .replace(SETTINGS_VALUE, '$1[REDACTED]')
    .replace(TOKEN_VALUE, '[REDACTED]')
    .replace(NAMED_VALUE, '$1[REDACTED]')
}

function safeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactLogText(value)
  if (!value || typeof value !== 'object') return value
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactLogText(value.message),
      stack: redactLogText(value.stack ?? ''),
    }
  }
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  if (Array.isArray(value)) return value.map((entry) => safeValue(entry, seen))
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_NAME.test(key) ? '[REDACTED]' : safeValue(entry, seen),
    ]),
  )
}

function formatArgs(args: unknown[]): string {
  return args
    .map((value) =>
      typeof value === 'string'
        ? redactLogText(value)
        : inspect(safeValue(value), { breakLength: Infinity, depth: 6 }),
    )
    .join(' ')
}

export function appendCappedLog(path: string, text: string, maxBytes = DEFAULT_MAX_BYTES): void {
  if (maxBytes < 1) return
  let bytes = Buffer.from(text, 'utf8')
  if (bytes.length > maxBytes) bytes = bytes.subarray(0, maxBytes)
  const currentBytes = existsSync(path) ? statSync(path).size : 0
  if (currentBytes + bytes.length > maxBytes) {
    const rotated = `${path}.1`
    rmSync(rotated, { force: true })
    if (existsSync(path)) renameSync(path, rotated)
    writeFileSync(path, bytes)
  } else {
    appendFileSync(path, bytes)
  }
}

export function installMainLogger(logsDir: string, maxBytes = DEFAULT_MAX_BYTES): string {
  mkdirSync(logsDir, { recursive: true })
  const path = join(logsDir, 'sanas-main.log')
  const originals = { log: console.log, warn: console.warn, error: console.error }
  const write = (level: string, args: unknown[]): void => {
    const line = `[${new Date().toISOString()}] [${level}] ${formatArgs(args)}\n`
    try {
      appendCappedLog(path, line, maxBytes)
    } catch {
      // A logging failure must never prevent Sanas from starting or exiting.
    }
  }
  console.log = (...args: unknown[]) => {
    originals.log(...args)
    write('LOG', args)
  }
  console.warn = (...args: unknown[]) => {
    originals.warn(...args)
    write('WARN', args)
  }
  console.error = (...args: unknown[]) => {
    originals.error(...args)
    write('ERROR', args)
  }
  process.on('uncaughtExceptionMonitor', (error) => write('UNCAUGHT_EXCEPTION', [error]))
  process.on('unhandledRejection', (reason) => write('UNHANDLED_REJECTION', [reason]))
  write('LOG', ['Main-process logging started'])
  return path
}
