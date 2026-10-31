import { app } from 'electron'
import updater from 'electron-updater'
import type { UpdateState } from '../../../shared/updates/types'
import { IPC } from '../../../shared/ipc'
import { broadcast } from '../../windows/broadcast'
import { createRestart, restartBlockReason } from './restart'

let autoUpdater: typeof updater.autoUpdater
let state: UpdateState = {
  revision: 0,
  currentVersion: app.getVersion(),
  phase: 'disabled',
  availableVersion: null,
  progress: null,
  error: null,
  canRestart: false,
  blockReason: 'Updates are available in installed builds.',
}
let downloaded = false
let enabled = false
let checking: Promise<UpdateState> | null = null
let interval: ReturnType<typeof setInterval> | undefined
let statusInterval: ReturnType<typeof setInterval> | undefined
const restart = createRestart(() => autoUpdater.quitAndInstall(false, true))

export function getUpdateState(): UpdateState {
  const blockReason = !enabled
    ? 'Updates are available in installed builds.'
    : state.phase === 'installing'
      ? 'Restarting to update.'
      : restartBlockReason(downloaded)
  return { ...state, canRestart: blockReason === null, blockReason }
}
function emit(patch: Partial<UpdateState> = {}): void {
  state = { ...state, ...patch, revision: state.revision + 1 }
  broadcast(IPC.UpdatesChanged, getUpdateState())
}
function failed(): void {
  restart.reset()
  emit({
    phase: downloaded ? 'downloaded' : 'error',
    error: 'Update could not complete. Please try again.',
  })
}
export function checkForUpdates(): Promise<UpdateState> {
  if (!enabled || downloaded || state.phase === 'downloading' || state.phase === 'available')
    return Promise.resolve(getUpdateState())
  if (checking) return checking
  emit({ phase: 'checking', error: null })
  checking = Promise.resolve()
    .then(() => autoUpdater.checkForUpdates())
    .catch(failed)
    .then(() => getUpdateState())
    .finally(() => {
      checking = null
    })
  return checking
}
export function restartToUpdate(): UpdateState {
  if (state.phase === 'installing') return getUpdateState()
  const reason = restartBlockReason(downloaded)
  if (!enabled || reason) return { ...getUpdateState(), error: reason ?? 'Updates are disabled.' }
  try {
    emit({ phase: 'installing', error: null })
    restart.restart(downloaded)
  } catch {
    failed()
  }
  return getUpdateState()
}
export function startUpdates(): void {
  if (!app.isPackaged || process.argv.includes('--smoke') || enabled) return
  autoUpdater = updater.autoUpdater
  enabled = true
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowDowngrade = false
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = null
  autoUpdater.on('error', failed)
  autoUpdater.on('update-available', (info) =>
    emit({ phase: 'available', availableVersion: info.version }),
  )
  autoUpdater.on('update-not-available', () => emit({ phase: 'idle', progress: null }))
  autoUpdater.on('download-progress', (info) =>
    emit({ phase: 'downloading', progress: Math.max(0, Math.min(100, info.percent)) }),
  )
  autoUpdater.on('update-downloaded', (info) => {
    downloaded = true
    emit({ phase: 'downloaded', availableVersion: info.version, progress: 100, error: null })
  })
  void checkForUpdates()
  interval = setInterval(
    () => {
      void checkForUpdates()
    },
    6 * 60 * 60 * 1000,
  )
  let previousReason = getUpdateState().blockReason
  statusInterval = setInterval(() => {
    const reason = getUpdateState().blockReason
    if (reason !== previousReason) {
      previousReason = reason
      emit()
    }
  }, 1000)
}
export function stopUpdates(): void {
  clearInterval(interval)
  clearInterval(statusInterval)
}
