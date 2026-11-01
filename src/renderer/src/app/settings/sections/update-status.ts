import type { UpdateState } from '@shared/updates/types'
import type { BadgeTone } from '../../controls/Badge'

export interface UpdateStatusView {
  /** One line for the status row. */
  text: string
  tone: BadgeTone
  /** 0–100 while downloading, otherwise null. */
  progress: number | null
  /** Whether "Check for updates" makes sense now. */
  canCheck: boolean
}

/** The updater's phase in words for Settings → Updates. */
export function describeUpdate(state: UpdateState | null): UpdateStatusView {
  if (!state) return { text: 'Loading…', tone: 'neutral', progress: null, canCheck: false }
  const version = state.availableVersion ? ` ${state.availableVersion}` : ''
  const busy = { progress: null, canCheck: false }
  switch (state.phase) {
    case 'disabled':
      return { text: 'Updates are off in this build', tone: 'neutral', ...busy }
    case 'checking':
      return { text: 'Checking for updates…', tone: 'accent', ...busy }
    case 'available':
      return { text: `Update${version} found — downloading`, tone: 'accent', ...busy }
    case 'downloading':
      return {
        text: `Downloading update${version}`,
        tone: 'accent',
        progress: Math.round(state.progress ?? 0),
        canCheck: false,
      }
    case 'downloaded':
      return {
        text: `Update${version} is ready to install`,
        tone: 'ok',
        progress: null,
        canCheck: true,
      }
    case 'installing':
      return { text: 'Installing — Sanas will restart', tone: 'accent', ...busy }
    case 'error':
      return { text: 'The last update check failed', tone: 'warn', progress: null, canCheck: true }
    default:
      return { text: 'No update waiting', tone: 'neutral', progress: null, canCheck: true }
  }
}
