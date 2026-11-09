/** The fire-and-forget `ipcMain.on` listener for audio chunks (no reply per chunk). A throw
 *  out of an `.on` listener is an uncaught main-process exception, so a failing sink (a
 *  transport that throws from send()) is contained here: the chunk is dropped and the first
 *  failure of a run is logged. */
export function createAudioChunkListener(
  sink: (chunk: Buffer) => void,
  warn: (message: string, error: unknown) => void = console.warn,
): (_event: unknown, chunk: unknown) => void {
  let failing = false
  return (_event, chunk) => {
    if (!(chunk instanceof ArrayBuffer)) return // anything else is dropped
    try {
      sink(Buffer.from(chunk))
      failing = false
    } catch (error) {
      if (!failing) warn('[sanas] audio chunk dropped:', error)
      failing = true
    }
  }
}
