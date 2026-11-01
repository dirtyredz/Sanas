import { useEffect, useState } from 'react'
import type { CaptureStatus } from '@shared/live-controls/capture'
import { captureNotice, isCapturing, newerStatus } from './capture-status'

export interface CaptureStatusModel {
  notice: { text: string; failed: boolean } | null
  capturing: boolean
}

/** Capture feedback for the current meeting. Window-lifetime: mounted above the workspaces so
 *  a shortcut capture reports even while another view is shown. */
export function useCaptureStatus(meetingId: number | null, answering: boolean): CaptureStatusModel {
  const [status, setStatus] = useState<CaptureStatus | null>(null)
  useEffect(() => {
    const remove = window.sanas.screenCapture.onStatus((next) =>
      setStatus((current) => newerStatus(current, next)),
    )
    // a first-use shortcut can broadcast before this overlay existed: fetch what was missed
    void window.sanas.screenCapture
      .getStatus()
      .then((next) => setStatus((current) => newerStatus(current, next)))
      .catch(() => {})
    return remove
  }, [])
  return {
    notice: captureNotice(status, meetingId, answering),
    capturing: isCapturing(status, meetingId),
  }
}
