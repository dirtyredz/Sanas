import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import {
  bindAudioCapture,
  receiveCaptureReply,
  stopAudioCapture,
  sendCapturedAudio,
  invalidCaptureMetadata,
} from '../../services/meetings'
import { generationValid, isCaptureReply } from './audio-validation'
import { createAudioChunkListener } from './audio-chunk'

export function registerAudioIpc(): void {
  let owner: number | undefined
  let generation: string | undefined
  let detach = (): void => {}
  ipcMain.handle(IPC.CaptureBind, (event, meetingId: unknown, gen: unknown) => {
    if (!Number.isSafeInteger(meetingId) || !generationValid(gen)) return false
    const accepted = bindAudioCapture(meetingId as number, gen, (probe) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC.CaptureProbe, probe)
    })
    if (!accepted) return false
    detach()
    owner = event.sender.id
    generation = gen
    const lost = (): void => stopAudioCapture(gen)
    event.sender.once('destroyed', lost)
    event.sender.once('render-process-gone', lost)
    event.sender.once('did-start-loading', lost)
    detach = () => {
      event.sender.removeListener('destroyed', lost)
      event.sender.removeListener('render-process-gone', lost)
      event.sender.removeListener('did-start-loading', lost)
    }
    return true
  })
  const listener = createAudioChunkListener(sendCapturedAudio, undefined, (raw) => {
    const gen = raw && typeof raw === 'object' && 'generation' in raw ? raw.generation : generation
    if (generation && gen === generation) invalidCaptureMetadata(generation)
  })
  ipcMain.on(IPC.AudioChunk, (event, frame: unknown) => {
    if (event.sender.id === owner) listener(event, frame)
  })
  ipcMain.on(IPC.CaptureReply, (event, reply: unknown) => {
    const receipt = performance.now()
    if (event.sender.id === owner && isCaptureReply(reply)) receiveCaptureReply(reply, receipt)
  })
  ipcMain.on(IPC.CaptureStop, (event, gen: unknown) => {
    if (event.sender.id === owner && gen === generation && generationValid(gen))
      stopAudioCapture(gen)
  })
}
