import { app, BrowserWindow } from 'electron'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, isAbsolute } from 'node:path'
import { loadScenario, type Step } from './scenario'
import { ScriptedSttProvider, RehearsalAssistant } from './providers'
import { RehearsalScreens } from './screens/desktop'
import { audioFrame, readPcmWav } from './audio/wav'
import { evaluate, type Evidence } from './assertions'
import { installSocketFaults } from './audio/socket-fault'
import { IPC } from '../../shared/ipc'
import type { SuggestionEvent, TranscriptEvent, MeetingState } from '../../shared/types'

function flag(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
}
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Called instead of normal startup, before settings/DB/services are imported. */
export async function runRehearsal(): Promise<void> {
  let reportPath: string | undefined
  let cleanup: (() => Promise<void>) | undefined
  let clearCredentials: (() => void) | undefined
  let exitCode = 1
  try {
    const root = flag('rehearsal-root')
    if (!root || !isAbsolute(root)) throw new Error('An absolute rehearsal-root is required')
    const folder = join(root, '.tmp', 'rehearsal')
    mkdirSync(folder, { recursive: true })
    const runFolder = mkdtempSync(join(folder, 'run-'))
    const profile = join(runFolder, 'profile')
    mkdirSync(profile)
    app.setName('sanas-rehearsal')
    app.setPath('userData', profile)
    reportPath = flag('rehearsal-report') ?? join(runFolder, 'report.json')
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
    await app.whenReady()
    // No logging of provider errors, request bodies or keys. The JSON report contains IDs/results only.
    console.log = () => {}
    console.warn = () => {}
    console.error = () => {}
    const { saveSettings } = await import('../config/settings')
    clearCredentials = () => {
      saveSettings({ deepgramApiKey: '', anthropicApiKey: '', anthropicWorkspaceId: '' })
    }
    saveSettings({
      deepgramApiKey: tier === 'audio' ? process.env.DEEPGRAM_API_KEY! : 'rehearsal-only',
      anthropicApiKey: assistant === 'claude' ? process.env.ANTHROPIC_API_KEY! : 'rehearsal-only',
      anthropicWorkspaceId: process.env.ANTHROPIC_WORKSPACE_ID ?? '',
      recordAudio: true,
      coachWhileTalking: !!scenario.coach,
      nudgeCooldownSec: 0,
      summaryEmailAuto: false,
    })
    const { openDb, closeDb } = await import('../db')
    await openDb()
    let epoch = performance.now()
    const now = (): number => Math.round(performance.now() - epoch)
    const stt = new ScriptedSttProvider()
    const { installRehearsalStt } = await import('../services/stt')
    const { deepgramProvider } = await import('../services/stt/deepgram')
    const evidence: Evidence[] = []
    let batchCount = 0
    const selectedStt = tier === 'audio' ? deepgramProvider : stt
    installRehearsalStt({
      start: (opts) => selectedStt.start(opts),
      transcribeFile: async (path, opts) => {
        const result = await selectedStt.transcribeFile(path, opts)
        batchCount = result.length
        return result
      },
    })
    const sockets = tier === 'audio' ? installSocketFaults() : undefined
    const { claudeProvider } = await import('../services/assistant/claude')
    const model = new RehearsalAssistant(now, assistant === 'claude' ? claudeProvider : undefined)
    const { installRehearsalAssistant } = await import('../services/assistant/provider')
    installRehearsalAssistant(model)
    const screens = new RehearsalScreens(now)
    const { installRehearsalDesktop } = await import('../services/screen-capture')
    installRehearsalDesktop(screens.desktop)
    const { observeRehearsalBroadcast } = await import('../windows/broadcast')
    const finals: TranscriptEvent[] = []
    let interimCount = 0
    observeRehearsalBroadcast((channel, payload) => {
      if (channel === IPC.SuggestionEvent) {
        const e = payload as SuggestionEvent
        if (e.kind === 'done')
          evidence.push({
            kind: e.purpose === 'next-point' ? 'coach' : 'suggestion',
            atMs: now(),
            text: e.text,
          })
        if (e.kind === 'error') evidence.push({ kind: 'assistant-error', atMs: now() })
      }
      if (channel === IPC.TranscriptEvent) {
        const e = payload as TranscriptEvent
        if (e.isFinal) finals.push(e)
        else interimCount++
      }
      if (channel === IPC.MeetingState && (payload as MeetingState).captureWarning)
        evidence.push({ kind: 'capture-warning', atMs: now() })
    })
    const meetings = await import('../services/meetings')
    const { isPostProcessing } = await import('../services/meetings/status/post-processing')
    const { listSegments } = await import('../db/repos/segments')
    const { listSuggestions } = await import('../db/repos/suggestions')
    const { getMeeting } = await import('../db/repos/meetings')
    cleanup = async () => {
      if (meetings.currentState().meetingId !== null) await meetings.stopMeeting()
      screens.close()
      sockets?.close()
      observeRehearsalBroadcast(undefined)
      for (const window of BrowserWindow.getAllWindows()) window.destroy()
      closeDb()
    }
    if (
      process.argv.includes('--visible') ||
      scenario.steps.some((s) => s.kind === 'screen' && s.real)
    ) {
      const { registerIpcHandlers } = await import('../ipc')
      registerIpcHandlers()
      const { showOverlay } = await import('../windows/overlay-window')
      showOverlay()
      await sleep(800)
    }
    const { createJob } = await import('../db/repos/jobs')
    const job = createJob(scenario.name)
    if (scenario.slides) {
      const { replaceJobSlides } = await import('../db/repos/job-slides')
      replaceJobSlides(job.id, scenario.slides)
    }
    const state = await meetings.startMeeting(job.id, wav?.channels ?? 2)
    if (state.status !== 'live' || state.meetingId === null || state.error)
      throw new Error('Meeting failed to start or recording failed')
    const meetingId = state.meetingId
    epoch = performance.now()
    const starts = new Map<string, number>()
    const tasks: Promise<void>[] = []
    let silentUntil = -1,
      lastReconnect = 0,
      lastSocketOpen = sockets?.opened() ?? 0
    const admission = (result: { accepted: boolean; reason?: string }): void => {
      if (!result.accepted && result.reason === 'busy') evidence.push({ kind: 'busy', atMs: now() })
    }
    const execute = async (step: Step): Promise<void> => {
      starts.set(step.id, now())
      switch (step.kind) {
        case 'utterance':
          if (tier === 'scripted') stt.utterance(step)
          break
        case 'ask':
          admission(await meetings.requestAssist({ meetingId, kind: 'typed', text: step.text }))
          break
        case 'detail': {
          const source = listSuggestions(meetingId)
            .filter(
              (s) => s.purpose === 'answer' && !['detail', 'audience'].includes(s.manualKind ?? ''),
            )
            .at(-1)
          if (!source) throw new Error('More detail has no completed source')
          admission(
            await meetings.requestAssist({
              meetingId,
              kind: 'detail',
              sourceSuggestionId: source.id,
            }),
          )
          break
        }
        case 'answer-mode':
          await meetings.setAnswerEveryQuestion(meetingId, step.enabled)
          break
        case 'slide': {
          const before = meetings.presentationState()
          const after = await meetings.moveSlide(meetingId, step.direction)
          evidence.push({ kind: 'slide', atMs: now(), passed: before.revision !== after.revision })
          break
        }
        case 'screen': {
          await screens.prepare(step)
          const result = await meetings.captureScreen(meetingId)
          admission(result)
          if (!result.accepted)
            evidence.push({
              kind: 'capture-error',
              atMs: now(),
              text: meetings.captureStatus().message,
            })
          break
        }
        case 'fault':
          if (step.fault === 'socket-drop') {
            if (sockets) sockets.drop()
            else stt.drop(now(), step.durationMs)
          } else if (step.fault === 'silent-them') silentUntil = now() + step.durationMs
          else if (step.fault === 'assistant-slow') model.slowUntil = now() + step.durationMs
          else if (step.fault === 'assistant-fail') model.failUntil = now() + step.durationMs
          else screens.inject(step.fault, step.durationMs)
          break
      }
    }
    let stepIndex = 0,
      audioMs = 0
    const duration = Math.max(scenario.durationMs, wav ? wav.pcm.length / (32 * wav.channels) : 0)
    const taskErrors: string[] = []
    while (now() <= duration) {
      const clock = now()
      while (stepIndex < scenario.steps.length && scenario.steps[stepIndex].atMs <= clock) {
        const step = scenario.steps[stepIndex++]
        tasks.push(
          execute(step).catch(() => {
            taskErrors.push(step.id)
          }),
        )
      }
      while (audioMs + 20 <= clock) {
        meetings.sendAudioChunk(audioFrame(wav, audioMs, clock < silentUntil))
        audioMs += 20
      }
      if (tier === 'scripted') stt.tick(clock)
      if (stt.reconnects > lastReconnect || (sockets?.opened() ?? 0) > lastSocketOpen) {
        evidence.push({ kind: 'reconnect', atMs: clock })
        lastReconnect = stt.reconnects
        lastSocketOpen = sockets?.opened() ?? 0
      }
      await sleep(10)
    }
    // Include the last partial frame; a WAV shorter than the scenario is zero-padded.
    while (audioMs < duration) {
      meetings.sendAudioChunk(audioFrame(wav, audioMs, now() < silentUntil))
      audioMs += 20
    }
    stt.tick(duration)
    while (stepIndex < scenario.steps.length) {
      const step = scenario.steps[stepIndex++]
      tasks.push(
        execute(step).catch(() => {
          taskErrors.push(step.id)
        }),
      )
    }
    await Promise.all(tasks)
    // Check live storage BEFORE batch replacement can hide an interim-persistence defect.
    const liveRows = listSegments(meetingId)
    const storedLines = liveRows
      .map((r) => JSON.stringify([r.tStartMs, r.tEndMs, r.text, r.speaker, r.isUser]))
      .sort()
    const finalLines = finals
      .map((r) => JSON.stringify([r.tStartMs, r.tEndMs, r.text, r.speaker, r.isUser]))
      .sort()
    evidence.push({
      kind: 'no-interims',
      atMs: now(),
      passed:
        (tier === 'audio' || interimCount > 0) &&
        storedLines.length === finalLines.length &&
        storedLines.every((r, i) => r === finalLines[i]),
    })
    await meetings.stopMeeting()
    const deadline =
      performance.now() + (assistant === 'claude' || tier === 'audio' ? 330000 : 10000)
    while (isPostProcessing(meetingId) && performance.now() < deadline) await sleep(20)
    if (isPostProcessing(meetingId)) throw new Error('Post-processing deadline exceeded')
    const saved = getMeeting(meetingId)
    evidence.push({
      kind: 'summary',
      atMs: now(),
      text: saved?.summary ?? '',
      passed: !!saved?.summary,
    })
    if (saved?.audioPath) {
      const recorded = readPcmWav(readFileSync(saved.audioPath))
      evidence.push({
        kind: 'recording',
        atMs: now(),
        passed: recorded.pcm.length > 0 && recorded.channels === (wav?.channels ?? 2),
      })
    }
    evidence.push({
      kind: 'batch',
      atMs: now(),
      passed: batchCount > 0 && listSegments(meetingId).length === batchCount,
    })
    for (const capture of screens.captures) {
      const delivered = model.requests.find(
        (r) => r.image && r.image === capture.base64 && r.atMs >= capture.atMs,
      )
      if (delivered)
        evidence.push({
          kind: 'screen',
          atMs: delivered.atMs,
          text: delivered.answer,
          passed: capture.verified,
        })
    }
    const checks = evaluate(scenario, evidence, starts, assistant)
    for (const id of taskErrors)
      checks.push({
        id,
        kind: 'step',
        passed: false,
        reason: 'Step failed; inspect isolated run artifacts',
      })
    exitCode = checks.every((c) => c.passed) ? 0 : 1
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          version: 1,
          scenario: scenario.name,
          tier,
          assistant,
          profile,
          meetingId,
          passed: exitCode === 0,
          checks,
        },
        null,
        2,
      ),
    )
  } catch {
    if (reportPath)
      writeFileSync(
        reportPath,
        JSON.stringify(
          {
            version: 1,
            passed: false,
            error:
              'Rehearsal setup or execution failed. Check scenario, local inputs and selected provider credentials.',
          },
          null,
          2,
        ),
      )
  } finally {
    try {
      await cleanup?.()
    } catch {
      exitCode = 1
    }
    try {
      clearCredentials?.()
    } catch {
      exitCode = 1
    }
    // Let readiness continuations unwind before terminating Electron (packaged smoke convention).
    setImmediate(() => app.exit(exitCode))
  }
}
