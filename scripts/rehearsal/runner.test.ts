import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readPcmWav } from '../../src/main/rehearsal/audio/wav'

const windows = process.platform === 'win32' ? it : it.skip
windows(
  'dry-run resolves a starter from outside the repository and prints its log path',
  () => {
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        resolve('scripts/rehearsal/run.ps1'),
        '-Scenario',
        'client-checkin',
        '-DryRun',
      ],
      { cwd: process.env.SystemRoot, encoding: 'utf8', timeout: 45000 },
    )
    expect(output).toContain('OK (exit 0) log:')
    expect(output).toContain(resolve('.tmp/owner-runs'))
    expect(output).toContain('no build')
  },
  50000,
)

windows(
  'offline Windows speech creates a replayable WAV on the declared channel',
  () => {
    const folder = resolve('.tmp/rehearsal-tests')
    mkdirSync(folder, { recursive: true })
    const scenario = resolve(folder, `tts-${process.pid}.json`),
      output = resolve(folder, `tts-${process.pid}.wav`)
    writeFileSync(
      scenario,
      JSON.stringify({
        version: 1,
        name: 'Client approval',
        durationMs: 2000,
        steps: [
          {
            id: 'approval',
            atMs: 100,
            kind: 'utterance',
            channel: 'them',
            speaker: 1,
            text: 'Ready.',
            durationMs: 1800,
          },
        ],
        expectations: [{ id: 'wav', kind: 'recording' }],
      }),
    )
    const result = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        resolve('scripts/rehearsal/render-audio.ps1'),
        '-Scenario',
        scenario,
        '-Output',
        output,
      ],
      { cwd: process.env.SystemRoot, encoding: 'utf8', timeout: 45000 },
    )
    expect(result).toContain('OK (exit 0) log:')
    const wav = readPcmWav(readFileSync(output))
    expect(wav.channels).toBe(2)
    expect(wav.pcm.length).toBe(128000)
    let them = false
    for (let i = 0; i < wav.pcm.length; i += 4) {
      expect(wav.pcm.readInt16LE(i)).toBe(0)
      them ||= wav.pcm.readInt16LE(i + 2) !== 0
    }
    expect(them).toBe(true)
  },
  50000,
)
