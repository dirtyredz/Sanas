import { stopHistoryWorker } from '../../services/history/live/worker-client'
import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { ScriptedSttProvider, RehearsalAssistant } from './outcomes/providers'
import { RehearsalScreens } from './screens/fixture-display'
import { installSocketFaults } from './audio/socket-fault'
import { imageDigest } from './outcomes/outcomes'
import { publicOutcome } from '../../services/mock-interview/turns/request-outcome'
import { flag, prepareProfile, readOptions } from './runner/options'
import { collectEvidence } from './runner/evidence'

/** Called instead of normal startup, before settings/DB/services are imported. */
export async function runRehearsal(): Promise<void> {
  if (!process.argv.includes('--rehearsal')) throw new Error('Rehearsal mode required')
  if (flag('tier') === 'live') {
    console.error('Live rehearsals moved to the Mock interview tab in Sanas.')
    app.exit(1)
    return
  }
  let reportPath: string | undefined
  let cleanup: (() => Promise<void>) | undefined
  let clearCredentials: (() => void) | undefined
  let diagnosticSnapshot: (() => object) | undefined
  let exitCode = 1
  try {
    const { root, profile, reportPath: destination } = prepareProfile()
    reportPath = destination
    const options = readOptions(root)
    const { scenario, tier, assistant, wav } = options
    await app.whenReady()
    // No logging of provider errors, request bodies or keys. The JSON report contains IDs/results only.
    console.log = () => {}
    console.warn = () => {}
    console.error = () => {}
    const { saveSettings } = await import('../../config/settings')
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
    const { openDb, closeDb } = await import('../../db')
    await openDb()
    let epoch = performance.now()
    const now = (): number => Math.round(performance.now() - epoch)
    const stt = new ScriptedSttProvider(scenario.steps)
    const { installRehearsalStt } = await import('../../services/stt')
    const { deepgramProvider } = await import('../../services/stt/deepgram/deepgram')
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
    const { claudeProvider } = await import('../../services/assistant/provider/claude')
    const model = new RehearsalAssistant(
      now,
      assistant === 'claude' ? claudeProvider : undefined,
      scenario.steps,
    )
    const collected = collectEvidence(scenario, model, now)
    const { evidence, finalReceipts, turnCompletions, transitions } = collected
    const { installRehearsalAssistant } = await import('../../services/assistant/provider/provider')
    installRehearsalAssistant(model)
    const screens = new RehearsalScreens(now)
    const { installRehearsalDesktop } = await import('../../services/screen-capture')
    installRehearsalDesktop(screens.desktop)
    const meetings = await import('../../services/meetings')
    const { createStepExecutor } = await import('./runner/steps')
    const { pumpClock, sleep } = await import('./runner/clock')
    const { finishReport, writeReport } = await import('./runner/report')
    const { stopMeetingAndWait } = await import('./runner/shutdown')
    cleanup = async () => {
      if (meetings.currentState().meetingId !== null) await meetings.stopMeeting()
      screens.close()
      sockets?.close()
      collected.close()
      for (const window of BrowserWindow.getAllWindows()) window.destroy()
      stopHistoryWorker()
      closeDb()
    }
    if (
      process.argv.includes('--visible') ||
      scenario.steps.some((s) => s.kind === 'screen' && s.real)
    ) {
      const { registerIpcHandlers } = await import('../../ipc')
      registerIpcHandlers()
      const { showOverlay } = await import('../../windows/overlay-window')
      showOverlay()
      await sleep(800)
    }
    const { createJob } = await import('../../db/repos/job/jobs')
    const job = createJob(scenario.name)
    const state = await meetings.startMeeting(
      job.id,
      wav?.channels ?? 2,
      scenario.meetingContext === undefined
        ? undefined
        : { meetingContext: scenario.meetingContext },
    )
    if (state.status !== 'live' || state.meetingId === null || state.error)
      throw new Error('Meeting failed to start or recording failed')
    const meetingId = state.meetingId
    epoch = performance.now()
    const executor = createStepExecutor({
      meetingId,
      tier,
      stt,
      model,
      screens,
      sockets,
      evidence,
      now,
    })
    const { admissions } = executor
    diagnosticSnapshot = () => ({
      profile,
      meetingId,
      scenario: scenario.name,
      tier,
      assistant,
      requests: model.requests.map(publicOutcome),
      transitions,
      // extra answer spend: every speculation is a paid call, promoted or not
      speculation: {
        started: transitions.filter((t) => t.event === 'speculation-started').length,
        promoted: transitions.filter((t) => t.event === 'speculation-promoted').length,
        discarded: transitions.filter((t) => t.event === 'speculation-discarded').length,
      },
      admissions,
      latency: collected.latency(),
      finalReceipts: Object.fromEntries(finalReceipts),
      turnCompletions: Object.fromEntries(turnCompletions),
      captures: screens.captures.map(({ base64, ...c }) => ({
        ...c,
        imageDigest: imageDigest(base64),
      })),
    })
    const taskErrors = await pumpClock({
      scenario,
      wav,
      now,
      tier,
      stt,
      sockets,
      model,
      evidence,
      executor,
    })
    const { liveRows, stoppedMs } = await stopMeetingAndWait({ options, model, meetingId, now })
    const result = await finishReport({
      options,
      collected,
      executor,
      model,
      screens,
      meetingId,
      liveRows,
      stoppedMs,
      now,
      batchCount: () => batchCount,
      taskErrors,
    })
    exitCode = result.passed ? 0 : 1
    writeReport(reportPath, { ...diagnosticSnapshot(), ...result })
  } catch {
    if (reportPath)
      writeFileSync(
        reportPath,
        JSON.stringify(
          {
            ...diagnosticSnapshot?.(),
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
