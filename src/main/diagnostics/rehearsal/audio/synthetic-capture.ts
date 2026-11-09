import { randomUUID } from 'node:crypto'
import type { CaptureProbe } from '@shared/meeting/audio-capture'
import * as meetings from '../../../services/meetings'

/** Explicit synthetic graph: generated PCM/WAV is processed in 20 ms quanta. These
 * anchors measure the harness, never physical playback or a real AudioWorklet. */
export class SyntheticCapture {
  private generation?: string
  private pending?: CaptureProbe
  private frame = 0
  private sequence = 0

  push(pcm: Buffer, channels: 1 | 2): void {
    const state = meetings.currentState()
    if (state.status !== 'live' || state.meetingId === null) {
      this.stop()
      return
    }
    if (!this.generation) {
      const generation = randomUUID()
      if (
        !meetings.bindAudioCapture(state.meetingId, generation, (probe) => {
          this.pending = probe
        })
      )
        return
      this.generation = generation
      this.frame = this.sequence = 0
    }
    const endFrame = this.frame + pcm.length / channels / 2
    meetings.sendCapturedAudio({
      generation: this.generation,
      sequence: this.sequence++,
      channels,
      startFrame: this.frame,
      endFrame,
      sourceEndFrame: endFrame,
      sourceRate: 16000,
      pcm: Uint8Array.from(pcm).buffer,
    })
    this.frame = endFrame
    if (this.pending) {
      meetings.receiveCaptureReply({
        ...this.pending,
        outputFrame: endFrame,
        sourceFrame: endFrame,
        sourceRate: 16000,
        quantumFrames: 320,
      })
      this.pending = undefined
    }
  }

  stop(): void {
    if (this.generation) meetings.stopAudioCapture(this.generation)
    this.generation = undefined
    this.pending = undefined
  }
}
