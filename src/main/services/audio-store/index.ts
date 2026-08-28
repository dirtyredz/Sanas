import { createWriteStream, mkdirSync, type WriteStream } from 'fs'
import { join } from 'path'
import { app } from 'electron'

// Writes the 16 kHz mono linear16 stream to a WAV file per meeting (opt-in).
// Header is patched with real sizes on stop.

const SAMPLE_RATE = 16000

let stream: WriteStream | null = null
let bytesWritten = 0
let currentPath: string | null = null

function wavHeader(dataBytes: number): Buffer {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + dataBytes, 4)
  h.write('WAVE', 8)
  h.write('fmt ', 12)
  h.writeUInt32LE(16, 16) // fmt chunk size
  h.writeUInt16LE(1, 20) // PCM
  h.writeUInt16LE(1, 22) // mono
  h.writeUInt32LE(SAMPLE_RATE, 24)
  h.writeUInt32LE(SAMPLE_RATE * 2, 28) // byte rate
  h.writeUInt16LE(2, 32) // block align
  h.writeUInt16LE(16, 34) // bits per sample
  h.write('data', 36)
  h.writeUInt32LE(dataBytes, 40)
  return h
}

export function startRecording(meetingId: number): string {
  const dir = join(app.getPath('userData'), 'audio')
  mkdirSync(dir, { recursive: true })
  currentPath = join(dir, `meeting-${meetingId}.wav`)
  stream = createWriteStream(currentPath)
  bytesWritten = 0
  stream.write(wavHeader(0)) // placeholder — patched on stop
  return currentPath
}

export function writeAudio(chunk: Buffer): void {
  if (!stream) return
  stream.write(chunk)
  bytesWritten += chunk.length
}

export async function stopRecording(): Promise<void> {
  if (!stream || !currentPath) return
  const s = stream
  const path = currentPath
  const bytes = bytesWritten
  stream = null
  currentPath = null
  await new Promise<void>((resolve) => s.end(resolve))
  // patch the header with real sizes
  const { open } = await import('fs/promises')
  const fh = await open(path, 'r+')
  await fh.write(wavHeader(bytes), 0, 44, 0)
  await fh.close()
}
