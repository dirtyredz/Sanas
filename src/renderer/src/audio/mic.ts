// Mic capture → AudioWorklet downsample (context rate → 16 kHz mono Int16)
// → ~100 ms chunks over IPC to main, which streams them to the STT provider.
// The worklet lives in public/downsample-processor.js — a static file, because
// the renderer CSP (script-src 'self') rightly refuses blob: module URLs.

export interface MicSession {
  stop(): Promise<void>
}

export async function startMic(deviceId: string): Promise<MicSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
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

  const ctx = new AudioContext()
  // relative path resolves under both the dev server and packaged file:// loads
  await ctx.audioWorklet.addModule('./downsample-processor.js')

  const source = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'downsample-processor')
  node.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
    window.sanas.meeting.sendAudio(ev.data)
  }
  source.connect(node)
  // no connection to ctx.destination — we never want mic playback

  return {
    async stop(): Promise<void> {
      node.port.onmessage = null
      source.disconnect()
      node.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      await ctx.close()
    }
  }
}
