import { createWriteStream, existsSync, mkdirSync, readdirSync, type WriteStream } from 'fs'
import { join } from 'path'
import { app } from 'electron'

// Writes the 16 kHz mono linear16 stream to a WAV file per meeting (opt-in).
// Header is patched with real sizes on stop.
//
// A file stream fails asynchronously: the open happens after createWriteStream returns and
// a disk-full write fails long after it was accepted, and an unhandled 'error' on a stream
// takes the process down. So startRecording waits for the open before it claims success,
// and a later failure drops the recording and calls back rather than throwing — a meeting
// is worth more than its recording, and the caller decides what to tell the user.

const SAMPLE_RATE = 16000

let stream: WriteStream | null = null
let bytesWritten = 0
let currentPath: string | null = null
let currentChannels = 1

function wavHeader(dataBytes: number, channels: number): Buffer {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + dataBytes, 4)
  h.write('WAVE', 8)
  h.write('fmt ', 12)
  h.writeUInt32LE(16, 16) // fmt chunk size
  h.writeUInt16LE(1, 20) // PCM
  h.writeUInt16LE(channels, 22)
  h.writeUInt32LE(SAMPLE_RATE, 24)
  h.writeUInt32LE(SAMPLE_RATE * 2 * channels, 28) // byte rate
  h.writeUInt16LE(2 * channels, 32) // block align
  h.writeUInt16LE(16, 34) // bits per sample
  h.write('data', 36)
  h.writeUInt32LE(dataBytes, 40)
  return h
}

function audioDir(): string {
  return join(app.getPath('userData'), 'audio')
}

/** Every recording on disk, by the meeting it was written for. Retention uses this to
 *  find files whose meeting is gone — a merge deletes rows, and a locked file survives. */
export function listRecordings(): { meetingId: number; path: string }[] {
  const dir = audioDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map((name) => ({ name, m: /^meeting-(\d+)\.wav$/.exec(name) }))
    .filter((x) => x.m !== null)
    .map((x) => ({ meetingId: Number(x.m![1]), path: join(dir, x.name) }))
}

/** Opens the meeting's WAV and resolves with its path once the file is really there.
 *  `onError` is called if the stream fails later (disk full, drive unplugged); the
 *  recording is dropped at that point and nothing more is written. */
export async function startRecording(
  meetingId: number,
  channels = 1,
  onError: (error: Error) => void = () => {},
): Promise<string> {
  const dir = audioDir()
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `meeting-${meetingId}.wav`)
  const s = createWriteStream(path)
  await new Promise<void>((resolve, reject) => {
    const opened = (): void => {
      s.off('error', failed)
      resolve()
    }
    const failed = (e: Error): void => {
      s.off('open', opened)
      s.on('error', () => {}) // it never opened; a second error must not take main down
      s.destroy()
      reject(e)
    }
    s.once('open', opened)
    s.once('error', failed)
  })
  s.on('error', (e: Error) => {
    if (stream === s) discardRecording()
    // an exception thrown here escapes the EventEmitter and kills main — and the most
    // likely caller failure is the same one that broke the stream (a full disk failing
    // the SQLite write that clears the meeting's audio_path)
    try {
      onError(e)
    } catch (callbackError) {
      console.warn('[sanas] recording error handler failed:', callbackError)
    }
  })
  stream = s
  currentPath = path
  currentChannels = channels
  bytesWritten = 0
  s.write(wavHeader(0, channels)) // placeholder — patched on stop
  return path
}

/** Forgets the current recording without patching its header — the file is broken or
 *  unwanted, and whoever asked is responsible for the meeting's `audio_path`. */
export function discardRecording(): void {
  const s = stream
  stream = null
  currentPath = null
  s?.destroy()
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
  // patch the header with real sizes. A failure here must not stop the meeting from
  // ending: the audio is on disk either way, only its declared length is wrong.
  try {
    const { open } = await import('fs/promises')
    const fh = await open(path, 'r+')
    await fh.write(wavHeader(bytes, currentChannels), 0, 44, 0)
    await fh.close()
  } catch (e) {
    console.warn('[sanas] could not finalise', path, e)
  }
}
