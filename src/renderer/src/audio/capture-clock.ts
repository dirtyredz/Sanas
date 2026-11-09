import type { CaptureFrame, CaptureProbe, CaptureReply } from '@shared/meeting/audio-capture'

/** No renderer timestamps cross this bridge. Main brackets a worklet observation. */
export function bridgeCapture(port: MessagePort, generation: string, api = window.sanas.meeting) {
  let active = false
  let stopped = false
  const off = api.onCaptureProbe((probe: CaptureProbe) => {
    if (active && probe.generation === generation) port.postMessage(probe)
  })
  const stop = (): void => {
    if (stopped) return
    stopped = true
    active = false
    off()
    port.onmessage = null
    api.stopCapture(generation)
  }
  port.onmessage = (
    event: MessageEvent<CaptureFrame | CaptureReply | { generation: string; kind: 'lost' }>,
  ) => {
    if (stopped || event.data.generation !== generation) return
    if ('kind' in event.data) {
      stop()
      return
    }
    if (!active) return
    if ('pcm' in event.data) api.sendAudio(event.data)
    else api.captureReply(event.data)
  }
  return {
    async activate(): Promise<void> {
      const state = await api.getState()
      if (
        stopped ||
        state.status !== 'live' ||
        state.meetingId === null ||
        !(await api.bindCapture(state.meetingId, generation))
      )
        throw new Error('Capture could not join the active meeting.')
      if (stopped) {
        api.stopCapture(generation)
        throw new Error('Capture stopped while joining the meeting.')
      }
      active = true
    },
    stop,
  }
}
