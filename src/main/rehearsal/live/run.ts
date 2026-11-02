import { app, BrowserWindow, globalShortcut, dialog } from 'electron'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { loadLivePlan } from './plan'
import { LiveEngine } from './engine'
import { createInterviewer } from './interviewer'
import { speakWindows } from './speech'
import { liveTurnReport, type LiveTransition } from './report'
import { RehearsalAssistant } from '../providers'
import { RehearsalScreens } from '../screens/desktop'
import { publicOutcome } from '../outcomes'
import { IPC } from '../../../shared/ipc'
import type { TranscriptEvent, SuggestionEvent } from '../../../shared/types'

const flag = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** This module is loaded only by explicit rehearsal dispatch; production capture owns audio. */
export async function runLiveRehearsal(): Promise<void> {
  if (!process.argv.includes('--rehearsal')) throw new Error('Rehearsal mode required')
  let reportPath: string | undefined, engine: LiveEngine | undefined
  let cleanup: (() => Promise<void>) | undefined, clearKeys: (() => void) | undefined
  let snapshot: (() => object) | undefined
  let code = 1,
    stage = 'setup'
  const controls: string[] = []
  try {
    const root = flag('rehearsal-root')
    if (!root || !isAbsolute(root)) throw new Error('Absolute root required')
    const folder = join(root, '.tmp/rehearsal')
    mkdirSync(folder, { recursive: true })
    const runFolder = mkdtempSync(join(folder, 'live-')),
      profile = join(runFolder, 'profile')
    mkdirSync(profile)
    app.setName('sanas-rehearsal')
    app.setPath('userData', profile)
    reportPath = flag('rehearsal-report') ?? join(runFolder, 'report.json')
    const plan = loadLivePlan(resolve(root, flag('scenario') ?? ''))
    if (!process.env.DEEPGRAM_API_KEY || !process.env.ANTHROPIC_API_KEY)
      throw new Error('Both keys required')
    await app.whenReady()
    console.log = console.warn = console.error = () => {}
    const { saveSettings, loadSettings } = await import('../../config/settings')
    clearKeys = () => {
      saveSettings({ deepgramApiKey: '', anthropicApiKey: '', anthropicWorkspaceId: '' })
    }
    saveSettings({
      deepgramApiKey: process.env.DEEPGRAM_API_KEY,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      anthropicWorkspaceId: process.env.ANTHROPIC_WORKSPACE_ID ?? '',
      meetingSource: 'this-pc',
      recordAudio: true,
      summaryEmailAuto: false,
      nudgeCooldownSec: 0,
    })
    const { openDb, closeDb } = await import('../../db')
    await openDb()
    const epoch = performance.now(),
      now = (): number => Math.round(performance.now() - epoch)
    const screens = new RehearsalScreens(now)
    const { claudeProvider } = await import('../../services/assistant/claude')
    const settings = loadSettings()
    const model = new RehearsalAssistant(now, claudeProvider)
    let audioMs = 0
    const { installRehearsalAssistant } = await import('../../services/assistant/provider')
    installRehearsalAssistant(model)
    engine = new LiveEngine(
      plan,
      createInterviewer(claudeProvider, {
        apiKey: settings.anthropicApiKey,
        workspaceId: settings.anthropicWorkspaceId,
        model: settings.nudgeModel,
      }),
      {
        now,
        audioNow: () => audioMs,
        speak: (text, signal) =>
          speakWindows(join(root, 'scripts/rehearsal/speak-live.ps1'), text, signal),
        share: (image) =>
          screens.prepare(
            {
              id: 'live-share',
              atMs: now(),
              kind: 'screen',
              image,
              real: true,
              displayId: plan.displayId,
            },
            true,
          ),
      },
    )
    const live = engine
    const { installRehearsalStt } = await import('../../services/stt')
    const { deepgramProvider } = await import('../../services/stt/deepgram')
    installRehearsalStt({
      start: async (opts) => {
        if (opts.channels !== 2) throw new Error('Live rehearsal requires This PC mic and loopback')
        audioMs = opts.startOffsetMs ?? 0
        const session = await deepgramProvider.start({
          ...opts,
          onSignal: (s) => {
            if (s.kind === 'reset') live.reset()
            else if (s.kind === 'activity' && s.channel === 0) live.activity()
            opts.onSignal?.(s)
          },
        })
        return {
          stop: () => session.stop(),
          sendAudio: (chunk) => {
            audioMs += chunk.length / 64 // 16 kHz * 2 channels * 2 bytes / 1000
            session.sendAudio(chunk)
          },
        }
      },
      transcribeFile: (path, opts) => deepgramProvider.transcribeFile(path, opts),
    })
    const { observeRehearsalBroadcast } = await import('../../windows/broadcast')
    const { observeRehearsalAssistance } =
      await import('../../services/meetings/assist/diagnostics')
    const transitions: LiveTransition[] = []
    observeRehearsalAssistance((e) =>
      transitions.push({
        atMs: now(),
        event: e.event,
        reason: e.reason,
        span: e.turn ? { startMs: e.turn.startMs, endMs: e.turn.endMs } : undefined,
      }),
    )
    let meetingId: number | null = null
    observeRehearsalBroadcast((channel, payload) => {
      if (channel === IPC.TranscriptEvent) {
        const t = payload as TranscriptEvent
        if (t.isFinal && t.meetingId === meetingId)
          live.final(t.isUser ? 'owner' : 'interviewer', t.text, t.tStartMs, t.tEndMs)
      }
      if (channel === IPC.SuggestionEvent) {
        const e = payload as SuggestionEvent
        const r = model.requests.find((r) => r.suggestionId === e.suggestionId)
        if (r && e.kind === 'delta' && e.text) r.firstVisibleMs ??= now()
        if (r && e.kind === 'done') {
          r.firstVisibleMs ??= now()
          r.deliveredMs = now()
        }
      }
    })
    const meetings = await import('../../services/meetings')
    const { isPostProcessing } = await import('../../services/meetings/status/post-processing')
    const { getMeeting } = await import('../../db/repos/meetings')
    const { listSegments } = await import('../../db/repos/segments')
    const { listSuggestions } = await import('../../db/repos/suggestions')
    const drain = async (): Promise<void> => {
      const deadline = now() + 180000
      while (meetingId !== null && isPostProcessing(meetingId) && now() < deadline) await sleep(100)
      if (meetingId !== null && isPostProcessing(meetingId))
        throw new Error('Post-processing deadline')
    }
    cleanup = async () => {
      live.end(live.endReason ?? 'cleanup')
      await live.settled()
      for (const key of controls) globalShortcut.unregister(key)
      screens.close()
      await meetings.stopMeeting()
      try {
        await drain()
      } finally {
        observeRehearsalBroadcast(undefined)
        observeRehearsalAssistance(undefined)
        for (const window of BrowserWindow.getAllWindows()) window.destroy()
        closeDb()
      }
    }
    snapshot = () => ({
      version: 1,
      tier: 'live',
      scenario: plan.name,
      profile,
      meetingId,
      endReason: live.endReason,
      latencyAnchor: 'last received loopback final',
      visibilityMeasurement: 'main-to-renderer suggestion broadcast (not compositor paint)',
      turns: liveTurnReport(live.turns, model.requests, transitions),
      requests: model.requests.map(publicOutcome),
      transitions,
      contentRubrics: 'not applicable: unscripted answers',
      record:
        meetingId === null
          ? undefined
          : {
              segments: listSegments(meetingId).length,
              suggestions: listSuggestions(meetingId).length,
              summarySaved: !!getMeeting(meetingId)?.summary,
            },
    })
    const { createJob } = await import('../../db/repos/jobs')
    createJob(plan.name)
    const { registerIpcHandlers } = await import('../../ipc')
    const { registerSystemAudioLoopback } = await import('../../system-audio')
    registerSystemAudioLoopback()
    registerIpcHandlers()
    const register = (key: string, action: () => void): void => {
      if (!globalShortcut.register(key, action))
        throw new Error('Live rehearsal control unavailable')
      controls.push(key)
    }
    register('CommandOrControl+Alt+Right', () => live.skip())
    register('CommandOrControl+Alt+End', () => live.end())
    register('CommandOrControl+Alt+Backspace', () => screens.close())
    const { createMainWindow } = await import('../../windows/main-window')
    const { showOverlay } = await import('../../windows/overlay-window')
    const window = createMainWindow()
    await new Promise<void>((r) => window.webContents.once('did-finish-load', () => r()))
    stage = 'audio-device-preflight'
    const devices = (await window.webContents.executeJavaScript(
      'navigator.mediaDevices.enumerateDevices().then(ds => ds.map(d => d.kind))',
    )) as string[]
    if (!devices.includes('audioinput') || !devices.includes('audiooutput'))
      throw new Error('Mic/output missing')
    await dialog.showMessageBox(window, {
      type: 'info',
      title: 'Live rehearsal ready',
      message: `${plan.name}: open Live, select this rehearsal job, keep This PC, then Start.`,
      detail:
        'Headphones recommended. After Start, the interviewer begins in 3 seconds. Answer aloud, then pause. ' +
        'Ctrl+Alt+Right skips; Ctrl+Alt+End ends; Ctrl+Alt+Backspace dismisses a share. ' +
        'Use the overlay Screen control for real screenshots. Only the isolated profile is used.',
    })
    stage = 'waiting-for-owner-start'
    const startDeadline = now() + 300000
    while (
      live.state !== 'ended' &&
      meetings.currentState().status !== 'live' &&
      now() < startDeadline
    )
      await sleep(100)
    meetingId = meetings.currentState().meetingId
    if (meetingId === null) throw new Error('Owner did not start a meeting')
    showOverlay()
    stage = 'live'
    await sleep(3000)
    if (live.state !== 'ended') live.start()
    while (live.state !== 'ended') {
      const state = meetings.currentState()
      if (state.status !== 'live') {
        live.end(state.error ? 'capture-failed' : 'meeting-stopped-or-paused')
        break
      }
      live.tick()
      await sleep(50)
    }
    await live.settled()
    stage = 'post-processing'
    await meetings.stopMeeting()
    await drain()
    code = ['output-failed', 'capture-failed'].includes(live.endReason ?? '') ? 1 : 0
    writeFileSync(
      reportPath,
      JSON.stringify({ ...snapshot(), passed: code === 0, checks: [] }, null, 2),
    )
  } catch {
    code = 1
    if (reportPath)
      writeFileSync(
        reportPath,
        JSON.stringify(
          {
            ...snapshot?.(),
            passed: false,
            error: `Live rehearsal failed during ${stage}. Inspect devices, This PC capture, controls and provider setup.`,
          },
          null,
          2,
        ),
      )
  } finally {
    try {
      await cleanup?.()
    } catch {
      code = 1
    }
    try {
      clearKeys?.()
    } catch {
      code = 1
    }
    setImmediate(() => app.exit(code))
  }
}
