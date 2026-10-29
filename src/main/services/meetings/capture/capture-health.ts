// Is the system-audio (loopback) channel actually carrying sound? Evaluated on the SAME
// interleaved 16 kHz linear16 stereo PCM `sendAudioChunk` accepts, before STT and the WAV,
// so it describes exactly the audio being saved and transcribed.
//
// The trap it surfaces: Electron's loopback captures the console DEFAULT output, but a call
// app may play to a different device (often the Windows communications default). Then ch1 is
// exact digital silence, the mic hears the call through the speakers, and every voice is
// labelled "Me" (GOTCHAS.md). The heuristic is advisory only: it never relabels, drops data,
// changes the channel count or stops the meeting. Ordinary remote silence can trigger it.
//
// Time is AUDIO time (counted from the samples), not wall time, so a pause cannot age it.

export const CAPTURE_WARNING =
  'No system audio detected — voices heard by the mic will be labeled Me. Check which speaker your call app plays to.'

/** Continuous exact-zero system audio before warning. */
export const SILENT_WARN_MS = 5_000
/** Of which the mic must have heard something for at least this long. */
export const MIC_ACTIVE_MS = 1_000
/** Continuous nonzero system audio before the warning clears. */
export const RECOVER_MS = 1_000
/** A mic chunk whose peak reaches this (of 32767) counts as the mic hearing sound. */
export const MIC_ACTIVE_PEAK = 300

const SAMPLE_RATE = 16_000
const FRAME_BYTES = 4 // two 16-bit samples

export class CaptureHealth {
  private silentMs = 0
  private micActiveMs = 0
  private activeMs = 0
  private warning = false

  /** Feed one chunk. Returns the new warning state when it changed, otherwise null.
   *  Mono capture has no loopback to check and never warns. */
  push(chunk: Buffer, channels: number): boolean | null {
    if (channels !== 2) return null
    const frames = Math.floor(chunk.length / FRAME_BYTES)
    if (frames === 0) return null
    let micPeak = 0
    let systemNonZero = false
    for (let f = 0; f < frames; f++) {
      const o = f * FRAME_BYTES
      const mic = Math.abs(chunk.readInt16LE(o))
      if (mic > micPeak) micPeak = mic
      if (chunk.readInt16LE(o + 2) !== 0) systemNonZero = true
    }
    const ms = (frames / SAMPLE_RATE) * 1000

    if (systemNonZero) {
      this.silentMs = 0
      this.micActiveMs = 0
      this.activeMs += ms
    } else {
      this.activeMs = 0
      this.silentMs += ms
      if (micPeak >= MIC_ACTIVE_PEAK) this.micActiveMs += ms
    }

    const next = this.warning
      ? this.activeMs < RECOVER_MS
      : this.silentMs >= SILENT_WARN_MS && this.micActiveMs >= MIC_ACTIVE_MS
    if (next === this.warning) return null
    this.warning = next
    return next
  }

  get warned(): boolean {
    return this.warning
  }

  /** Start/resume: a new capture session begins with no history. */
  reset(): void {
    this.silentMs = 0
    this.micActiveMs = 0
    this.activeMs = 0
    this.warning = false
  }
}
