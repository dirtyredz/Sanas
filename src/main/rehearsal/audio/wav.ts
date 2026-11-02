export interface PcmWav {
  channels: 1 | 2
  pcm: Buffer
}
/** Parse RIFF chunks (including SAPI JUNK/LIST chunks), not a guessed 44-byte offset. */
export function readPcmWav(bytes: Buffer): PcmWav {
  if (
    bytes.length < 12 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WAVE'
  )
    throw new Error('Expected a RIFF WAV')
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) throw new Error('Truncated or trailing WAV data')
  let channels: 1 | 2 | undefined, pcm: Buffer | undefined
  for (let at = 12; at + 8 <= bytes.length;) {
    const name = bytes.toString('ascii', at, at + 4),
      size = bytes.readUInt32LE(at + 4),
      start = at + 8
    if (start + size > bytes.length) throw new Error('Truncated WAV chunk')
    if (name === 'fmt ') {
      if (
        size < 16 ||
        bytes.readUInt16LE(start) !== 1 ||
        bytes.readUInt32LE(start + 4) !== 16000 ||
        bytes.readUInt16LE(start + 14) !== 16
      )
        throw new Error('WAV must be 16 kHz linear16 PCM')
      const count = bytes.readUInt16LE(start + 2)
      if (count !== 1 && count !== 2) throw new Error('WAV must have one or two channels')
      channels = count
      if (
        bytes.readUInt16LE(start + 12) !== count * 2 ||
        bytes.readUInt32LE(start + 8) !== 16000 * count * 2
      )
        throw new Error('Invalid PCM alignment')
    }
    if (name === 'data') pcm = bytes.subarray(start, start + size)
    at = start + size + (size % 2)
  }
  if (!channels || !pcm?.length || pcm.length % (channels * 2))
    throw new Error('Missing or misaligned PCM data')
  return { channels, pcm }
}
export function wavBytes(pcm: Buffer, channels: 1 | 2): Buffer {
  const h = Buffer.alloc(44)
  h.write('RIFF')
  h.writeUInt32LE(36 + pcm.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(channels, 22)
  h.writeUInt32LE(16000, 24)
  h.writeUInt32LE(32000 * channels, 28)
  h.writeUInt16LE(channels * 2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}
/** Audio-frame ingress matches the renderer's 20 ms linear16 frames. */
export function audioFrame(wav: PcmWav | undefined, atMs: number, silentThem: boolean): Buffer {
  const channels = wav?.channels ?? 2
  const frame = Buffer.alloc(320 * channels * 2)
  if (wav) {
    const offset = Math.round(atMs * 16) * channels * 2
    if (offset < wav.pcm.length) wav.pcm.copy(frame, 0, offset, offset + frame.length)
  } else
    for (let i = 0; i < 320; i++) {
      frame.writeInt16LE(i % 2 ? 800 : -800, i * 4)
      frame.writeInt16LE(i % 2 ? 600 : -600, i * 4 + 2)
    }
  if (silentThem && channels === 2) for (let i = 0; i < 320; i++) frame.writeInt16LE(0, i * 4 + 2)
  return frame
}
