import type { CaptureFrame, CaptureReply } from '@shared/meeting/audio-capture'
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0
export const generationValid = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(v)
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'
const rate = (v: unknown): v is number => integer(v) && v >= 8000 && v <= 192000

export function isCaptureFrame(v: unknown): v is CaptureFrame {
  if (!object(v)) return false
  return (
    generationValid(v.generation) &&
    integer(v.sequence) &&
    integer(v.startFrame) &&
    integer(v.endFrame) &&
    v.endFrame > v.startFrame &&
    integer(v.sourceEndFrame) &&
    rate(v.sourceRate) &&
    (v.channels === 1 || v.channels === 2) &&
    v.pcm instanceof ArrayBuffer &&
    v.pcm.byteLength <= 64000 &&
    v.pcm.byteLength === (v.endFrame - v.startFrame) * v.channels * 2 &&
    (v.sourceEndFrame / v.sourceRate) * 16000 >= v.endFrame &&
    (v.sourceEndFrame / v.sourceRate) * 16000 - v.endFrame <= 2048
  )
}

export function isCaptureReply(v: unknown): v is CaptureReply {
  return (
    object(v) &&
    generationValid(v.generation) &&
    integer(v.nonce) &&
    integer(v.outputFrame) &&
    integer(v.sourceFrame) &&
    rate(v.sourceRate) &&
    integer(v.quantumFrames) &&
    v.quantumFrames > 0 &&
    v.quantumFrames <= 2048
  )
}
