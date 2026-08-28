// AudioWorklet: resample native rate → 16 kHz mono Int16, emit 100 ms chunks.
// Static file (not a blob URL) so the renderer CSP can stay at script-src 'self'.

const TARGET_RATE = 16000
const CHUNK_SAMPLES = 1600 // 100 ms at 16 kHz

class DownsampleProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / TARGET_RATE
    this.readPos = 0
    this.input = [] // queued Float32 samples at native rate
    this.out = new Int16Array(CHUNK_SAMPLES)
    this.outPos = 0
  }

  process(inputs) {
    const ch = inputs[0][0]
    if (!ch) return true
    for (let i = 0; i < ch.length; i++) this.input.push(ch[i])

    // consume whole strides, keeping fractional position for continuity
    while (this.readPos + this.ratio < this.input.length) {
      const idx = Math.floor(this.readPos)
      const frac = this.readPos - idx
      const s = this.input[idx] * (1 - frac) + this.input[idx + 1] * frac
      this.out[this.outPos++] = Math.max(-32768, Math.min(32767, s * 32768))
      this.readPos += this.ratio
      if (this.outPos === CHUNK_SAMPLES) {
        this.port.postMessage(this.out.buffer.slice(0))
        this.outPos = 0
      }
    }
    // drop consumed samples, keep the fraction
    const consumed = Math.floor(this.readPos)
    this.input = this.input.slice(consumed)
    this.readPos -= consumed
    return true
  }
}

registerProcessor('downsample-processor', DownsampleProcessor)
