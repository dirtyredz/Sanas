import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendCappedLog, redactLogText } from './main-log'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

it('redacts named secrets and key-shaped provider tokens', () => {
  const input =
    'apiKey="owner-key" password: hunter2 authorization=Bearer-abc settings={"recordAudio":true} sk-ant-api03-supersecret dg_tokenvalue'
  const redacted = redactLogText(input)
  expect(redacted).not.toContain('owner-key')
  expect(redacted).not.toContain('hunter2')
  expect(redacted).not.toContain('Bearer-abc')
  expect(redacted).not.toContain('recordAudio')
  expect(redacted).not.toContain('supersecret')
  expect(redacted).not.toContain('tokenvalue')
  expect(redacted.match(/\[REDACTED\]/g)?.length).toBe(6)
})

it('rotates once and keeps both files within the configured size cap', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sanas-main-log-'))
  dirs.push(dir)
  const path = join(dir, 'main.log')
  appendCappedLog(path, 'first-line\n', 16)
  appendCappedLog(path, 'second-line\n', 16)
  appendCappedLog(path, 'x'.repeat(40), 16)
  expect(readFileSync(`${path}.1`, 'utf8')).toBe('second-line\n')
  expect(readFileSync(path, 'utf8')).toBe('x'.repeat(16))
  expect(statSync(path).size).toBeLessThanOrEqual(16)
  expect(statSync(`${path}.1`).size).toBeLessThanOrEqual(16)
})
