// AudioWorklet: resample native rate → 16 kHz Int16, emit 100 ms chunks.
// Supports 1 channel (mic only) or 2 (mic + system-audio loopback), producing
// interleaved frames — channel 0 = mic/user, channel 1 = loopback/others.
// Static file (not a blob URL) so the renderer CSP can stay at script-src 'self'.

const TARGET_RATE = 16000
const CHUNK_FRAMES = 1600 // 100 ms at 16 kHz

class DownsampleProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this.channels = (options && options.processorOptions && options.processorOptions.channels) || 1
    this.ratio = sampleRate / TARGET_RATE
    this.readPos = 0
    this.queues = Array.from({ length: this.channels }, () => []) // Float32 at native rate
    this.out = new Int16Array(CHUNK_FRAMES * this.channels)
    this.outFrame = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true
    const frames = input[0].length

    // queue each channel; a missing channel pads silence to stay frame-aligned
    for (let c = 0; c < this.channels; c++) {
      const src = input[c]
      const q = this.queues[c]
      if (src) for (let i = 0; i < frames; i++) q.push(src[i])
      else for (let i = 0; i < frames; i++) q.push(0)
    }

    // consume whole strides, keeping fractional position for continuity
    while (this.readPos + this.ratio < this.queues[0].length) {
      const idx = Math.floor(this.readPos)
      const frac = this.readPos - idx
      for (let c = 0; c < this.channels; c++) {
        const q = this.queues[c]
        const s = q[idx] * (1 - frac) + q[idx + 1] * frac
        this.out[this.outFrame * this.channels + c] = Math.max(
          -32768,
          Math.min(32767, s * 32768)
        )
      }
      this.readPos += this.ratio
      this.outFrame++
      if (this.outFrame === CHUNK_FRAMES) {
        this.port.postMessage(this.out.buffer.slice(0))
        this.outFrame = 0
      }
    }
    // drop consumed samples, keep the fraction
    const consumed = Math.floor(this.readPos)
    for (let c = 0; c < this.channels; c++) this.queues[c] = this.queues[c].slice(consumed)
    this.readPos -= consumed
    return true
  }
}

registerProcessor('downsample-processor', DownsampleProcessor)
