import { app } from 'electron'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { join, resolve, isAbsolute } from 'node:path'
import { loadScenario } from '../scenario/scenario'
import { readPcmWav } from '../audio/wav'
export function flag(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
}

export function prepareProfile() {
  const root = flag('rehearsal-root')
  if (!root || !isAbsolute(root)) throw new Error('An absolute rehearsal-root is required')
  const folder = join(root, '.tmp', 'rehearsal')
  mkdirSync(folder, { recursive: true })
  const runFolder = mkdtempSync(join(folder, 'run-'))
  const profile = join(runFolder, 'profile')
  mkdirSync(profile)
  app.setName('sanas-rehearsal')
  app.setPath('userData', profile)
  const reportPath = flag('rehearsal-report') ?? join(runFolder, 'report.json')

  return { root, profile, reportPath }
}
export function readOptions(root: string) {
  const scenarioPath = flag('scenario')
  if (!scenarioPath) throw new Error('Scenario required')
  const scenario = loadScenario(resolve(root, scenarioPath))
  if (process.argv.includes('--real-capture'))
    for (const step of scenario.steps) if (step.kind === 'screen') step.real = true
  const tier = flag('tier') ?? 'scripted',
    assistant = flag('assistant') ?? 'canned'
  if (!['scripted', 'audio'].includes(tier) || !['canned', 'claude'].includes(assistant))
    throw new Error('Invalid tier or assistant')
  if (tier === 'audio' && !process.env.DEEPGRAM_API_KEY)
    throw new Error('DEEPGRAM_API_KEY required for audio tier')
  if (assistant === 'claude' && !process.env.ANTHROPIC_API_KEY)
    throw new Error('ANTHROPIC_API_KEY required for Claude')
  const wavPath = flag('audio') ?? scenario.audio
  const wav =
    tier === 'audio'
      ? readPcmWav(
          readFileSync(
            wavPath ??
              (() => {
                throw new Error('Audio tier requires -Audio or a rendered scenario WAV')
              })(),
          ),
        )
      : undefined

  return { scenario, tier, assistant, wav }
}
export type RehearsalOptions = ReturnType<typeof readOptions>
