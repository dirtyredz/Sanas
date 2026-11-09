import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import type { CaptureFrame, CaptureReply } from '@shared/meeting/audio-capture'

it.each([16000, 44100, 48000])(
  'preserves mono/stereo positions at %i Hz and replies only in a quantum',
  (rate) => {
    for (const channels of [1, 2]) {
      const messages: (CaptureFrame | CaptureReply)[] = []
      interface Worklet {
        port: { onmessage(e: { data: { generation: string; nonce: number } }): void }
        process(inputs: Float32Array[][]): void
        outputFrame: number
      }
      let Processor!: new (options: unknown) => Worklet
      const context = {
        sampleRate: rate,
        currentFrame: 0,
        ArrayBuffer,
        Int16Array,
        AudioWorkletProcessor: class {
          port = {
            postMessage: (m: CaptureFrame | CaptureReply) => messages.push(m),
            onmessage: (_e: unknown) => {},
          }
        },
        registerProcessor: (_name: string, ctor: unknown) => {
          Processor = ctor as typeof Processor
        },
      }
      runInNewContext(readFileSync('src/renderer/public/downsample-processor.js', 'utf8'), context)
      const worklet = new Processor({ processorOptions: { channels, generation: 'g' } })
      worklet.port.onmessage({ data: { generation: 'g', nonce: 1 } })
      expect(messages).toHaveLength(0)
      for (let i = 0; i < 400; i++) {
        worklet.process([Array.from({ length: channels }, () => new Float32Array(128))])
        context.currentFrame += 128
      }
      const reply = messages.find((m) => 'nonce' in m)!
      expect(reply).toMatchObject({ generation: 'g', nonce: 1, sourceRate: rate, sourceFrame: 128 })
      const frames = messages.filter((m): m is CaptureFrame => 'pcm' in m)
      expect(frames.length).toBeGreaterThan(5)
      frames.forEach((f, i) => {
        expect(f.pcm.byteLength).toBe(1600 * channels * 2)
        expect((f.sourceEndFrame / rate) * 16000).toBeGreaterThanOrEqual(f.endFrame)
        expect(f.sequence).toBe(i)
        expect(f.startFrame).toBe(i * 1600)
        expect(f.endFrame).toBe((i + 1) * 1600)
      })
      expect(Math.abs(worklet.outputFrame - ((400 * 128) / rate) * 16000)).toBeLessThanOrEqual(2)
      context.currentFrame += 128
      worklet.process([[new Float32Array(128)]])
      expect(messages.at(-1)).toMatchObject({ kind: 'lost' })
    }
  },
)
