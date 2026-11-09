import { liveMeetingId, onLiveMeetingChange } from '../../meetings/status/live-meeting'
import { onPostProcessingChange, postProcessingCount } from '../../meetings/status/post-processing'

export const UPDATES_DISABLED_MESSAGE = 'Updates are available in installed builds.'

/** Calls `listener` when either guard behind `restartBlockReason` may have changed. */
export function onRestartGuardChange(listener: () => void): () => void {
  const offs = [onLiveMeetingChange(listener), onPostProcessingChange(listener)]
  return () => offs.forEach((off) => off())
}

export function restartBlockReason(downloaded: boolean): string | null {
  if (!downloaded) return 'An update must finish downloading first.'
  if (liveMeetingId() !== null)
    return 'Stop the meeting before restarting (including paused meetings).'
  if (postProcessingCount() > 0) return 'Wait for meeting processing to finish.'
  return null
}

export function createRestart(install: () => void): {
  restart: (downloaded: boolean) => void
  reset: () => void
} {
  let installing = false
  return {
    restart(downloaded) {
      if (installing) return
      const reason = restartBlockReason(downloaded)
      if (reason) throw new Error(reason)
      installing = true
      try {
        install()
      } catch (error) {
        installing = false
        throw error
      }
    },
    reset() {
      installing = false
    },
  }
}
