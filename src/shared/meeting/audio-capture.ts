/** Sample positions are per channel; PCM is interleaved 16 kHz linear16. */
export interface CaptureFrame {
  generation: string
  sequence: number
  startFrame: number
  endFrame: number
  sourceEndFrame: number
  sourceRate: number
  channels: 1 | 2
  pcm: ArrayBuffer
}

export interface CaptureProbe {
  generation: string
  nonce: number
}

export interface CaptureReply extends CaptureProbe {
  outputFrame: number
  sourceFrame: number
  sourceRate: number
  quantumFrames: number
}

export type CaptureUnavailable =
  | 'missing-metadata'
  | 'missing-anchors'
  | 'outside-history'
  | 'wide-interval'
  | 'discontinuity'
  | 'reset'
  | 'stopped'
  | 'probe-timeout'

export type CaptureEndpoint =
  | { status: 'valid'; lowerMs: number; upperMs: number }
  | { status: 'unavailable'; reason: CaptureUnavailable }

export const CAPTURE_PROBE_MS = 250
export const CAPTURE_TIMEOUT_MS = 2_000
export const CAPTURE_RETENTION_MS = 30_000
export const CAPTURE_MAX_INTERVAL_MS = 1_000
