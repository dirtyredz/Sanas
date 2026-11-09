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
    this.outputFrame = 0
    this.sourceFrame = 0
    this.sequence = 0
    this.generation = options.processorOptions.generation
    this.probe = null
    this.graphEnd = null
    this.lost = false
    this.port.onmessage = (event) => {
      if (event.data.generation === this.generation) this.probe = event.data
    }
  }

  process(inputs) {
    const input = inputs[0]
    if (this.lost) return true
    if ((!input || !input[0]) && this.graphEnd === null) return true
    if (!input || !input[0] || (this.graphEnd !== null && currentFrame !== this.graphEnd)) {
      this.lost = true
      this.port.postMessage({ generation: this.generation, kind: 'lost' })
      return true
    }
    const frames = input[0].length
    this.graphEnd = currentFrame + frames
    this.sourceFrame += frames

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
        this.out[this.outFrame * this.channels + c] = Math.max(-32768, Math.min(32767, s * 32768))
      }
      this.readPos += this.ratio
      this.outFrame++
      this.outputFrame++
      if (this.outFrame === CHUNK_FRAMES) {
        this.port.postMessage({
          generation: this.generation,
          sequence: this.sequence++,
          channels: this.channels,
          startFrame: this.outputFrame - CHUNK_FRAMES,
          endFrame: this.outputFrame,
          sourceEndFrame: this.sourceFrame,
          sourceRate: sampleRate,
          pcm: this.out.buffer.slice(0),
        })
        this.outFrame = 0
      }
    }
    // drop consumed samples, keep the fraction
    const consumed = Math.floor(this.readPos)
    for (let c = 0; c < this.channels; c++) this.queues[c] = this.queues[c].slice(consumed)
    this.readPos -= consumed
    // Reply from a processing quantum, never from an idle/suspended port callback.
    if (this.probe) {
      this.port.postMessage({
        ...this.probe,
        outputFrame: this.outputFrame,
        sourceFrame: this.sourceFrame,
        sourceRate: sampleRate,
        quantumFrames: frames,
      })
      this.probe = null
    }
    return true
  }
}

registerProcessor('downsample-processor', DownsampleProcessor)
