// Audio capture → AudioWorklet downsample (context rate → 16 kHz Int16)
// → ~100 ms chunks over IPC to main, which streams them to the STT provider.
//
// Two modes:
//  - mono: mic only (meetings happening in the room / on another device)
//  - stereo: mic (ch 0) + system-audio loopback (ch 1) for meetings on THIS PC —
//    the loopback tap is digital, so driver echo-cancellation can't erase it.
//
// The worklet lives in public/downsample-processor.js — a static file, because
// the renderer CSP (script-src 'self') rightly refuses blob: module URLs.

export interface CaptureSession {
  /** 1 = mic only; 2 = mic + system loopback (interleaved). */
  channels: number
  stop(): Promise<void>
}

export async function startCapture(
  deviceId: string,
  captureSystemAudio: boolean
): Promise<CaptureSession> {
  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      channelCount: 1,
      // deliberate: raw room audio for STT, not conferencing-processed (GOTCHAS.md);
      // AGC off too — gain pumping erases the level/timbre cues diarization needs
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  })

  // System loopback rides getDisplayMedia; main's setDisplayMediaRequestHandler
  // answers with audio:'loopback'. Video is mandatory in the request — drop it.
  let loopbackStream: MediaStream | null = null
  if (captureSystemAudio) {
    try {
      loopbackStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      loopbackStream.getVideoTracks().forEach((t) => t.stop())
      if (loopbackStream.getAudioTracks().length === 0) loopbackStream = null
    } catch {
      loopbackStream = null // loopback unavailable — fall back to mic-only
    }
  }
  const channels = loopbackStream ? 2 : 1

  const ctx = new AudioContext()
  // relative path resolves under both the dev server and packaged file:// loads
  await ctx.audioWorklet.addModule('./downsample-processor.js')

  const node = new AudioWorkletNode(ctx, 'downsample-processor', {
    numberOfInputs: 1,
    channelCount: channels,
    channelCountMode: 'explicit',
    channelInterpretation: 'discrete', // never downmix — ch 0 stays mic, ch 1 loopback
    processorOptions: { channels }
  })
  node.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
    window.sanas.meeting.sendAudio(ev.data)
  }

  const micSource = ctx.createMediaStreamSource(micStream)
  if (loopbackStream) {
    const merger = ctx.createChannelMerger(2)
    micSource.connect(merger, 0, 0)
    ctx.createMediaStreamSource(loopbackStream).connect(merger, 0, 1)
    merger.connect(node)
  } else {
    micSource.connect(node)
  }
  // no connection to ctx.destination — we never want playback

  return {
    channels,
    async stop(): Promise<void> {
      node.port.onmessage = null
      node.disconnect()
      micStream.getTracks().forEach((t) => t.stop())
      loopbackStream?.getTracks().forEach((t) => t.stop())
      await ctx.close()
    }
  }
}
