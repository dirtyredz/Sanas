import type { MeetingSource } from '@shared/types'
import { startCapture, type CaptureSession } from '../../audio/mic'

let starting = false

/** Shared Start path: release every unadopted device on failure, including stereo fallback. */
export async function startCapturedMeeting<T>(
  source: MeetingSource,
  open: (channels: 1 | 2) => Promise<T>,
  accepted: (result: T) => boolean,
  stereoRequired = false,
): Promise<{ capture: CaptureSession; result: T }> {
  if (starting) throw new Error('Another meeting is starting. Please wait.')
  starting = true
  let capture: CaptureSession | undefined
  try {
    const current = await window.sanas.meeting.getState()
    if (current.meetingId !== null)
      throw new Error('End the current meeting before starting another.')
    const settings = await window.sanas.settings.set({ meetingSource: source })
    capture = await startCapture(settings.audioDeviceId, source === 'this-pc')
    const channels = capture.channels
    if (channels !== 1 && channels !== 2) throw new Error('Unsupported capture topology')
    if (stereoRequired && capture.channels !== 2)
      throw new Error(
        'System audio is unavailable. Check your default output device and try again; the mock interview has not started.',
      )
    const result = await open(channels)
    if (!accepted(result))
      throw new Error('The meeting could not start. Check Settings and your audio devices.')
    return { capture, result }
  } catch (e) {
    await capture?.stop()
    throw e
  } finally {
    starting = false
  }
}
