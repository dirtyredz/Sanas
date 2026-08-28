import { desktopCapturer, session } from 'electron'

// System-audio loopback (Windows): when the renderer asks for display media,
// answer with a screen source and audio:'loopback' — the signal headed to the
// output device. Driver echo-cancellation never touches this path, so same-PC
// meeting audio survives intact (see docs/DECISIONS.md 2026-08-28).

export function registerSystemAudioLoopback(): void {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen'] })
      .then((sources) => callback({ video: sources[0], audio: 'loopback' }))
      .catch(() => callback({}))
  })
}
