import { spawn } from 'node:child_process'

/** Offline default-device playback, not PCM injection. Only our child is ever terminated. */
export function speakWindows(script: string, text: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
      { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] },
    )
    let timedOut = false
    const stop = (): void => {
      child.kill()
    }
    const timer = setTimeout(() => {
      timedOut = true
      stop()
    }, 60000)
    signal.addEventListener('abort', stop, { once: true })
    child.stdin.on('error', () => {}) // early cancellation can close stdin before its write
    child.stdin.end(Buffer.from(text, 'utf8').toString('base64'))
    child.on('error', () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', stop)
      reject(new Error('Offline speech process could not start'))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', stop)
      if (signal.aborted) resolve()
      else if (code === 0 && !timedOut) resolve()
      else reject(new Error('Offline speech playback failed'))
    })
  })
}
