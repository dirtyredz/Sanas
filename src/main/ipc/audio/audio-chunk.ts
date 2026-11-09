/** The fire-and-forget `ipcMain.on` listener for audio chunks (no reply per chunk). A throw
 *  out of an `.on` listener is an uncaught main-process exception, so a failing sink (a
 *  transport that throws from send()) is contained here: the chunk is dropped and the first
 *  failure of a run is logged. */
import type { CaptureFrame } from '@shared/meeting/audio-capture'
import { isCaptureFrame } from './audio-validation'

export function createAudioChunkListener(
  sink: (chunk: CaptureFrame, receipt: number) => void,
  warn: (message: string, error: unknown) => void = console.warn,
  invalid: (chunk: unknown) => void = () => {},
): (_event: unknown, chunk: unknown) => void {
  let failing = false
  return (_event, chunk) => {
    const receipt = performance.now()
    if (!isCaptureFrame(chunk)) {
      invalid(chunk)
      return
    }
    try {
      sink(chunk, receipt)
      failing = false
    } catch (error) {
      if (!failing) warn('[sanas] audio chunk dropped:', error)
      failing = true
    }
  }
}
