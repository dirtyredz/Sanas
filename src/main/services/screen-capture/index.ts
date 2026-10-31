import type { Rectangle } from 'electron'
import type { AssistImage } from '../assistant/types'
import { captureDisplay, electronDesktop, targetDisplay, type CaptureDisplay } from './desktop'
import { encodeForAssistant, thumbnailDataUrl } from './encode'

// The Electron-bound screen capture used by the meeting: pick the display, capture it within
// the deadline, encode it for the assistant and derive the overlay thumbnail. The captured
// image is dropped as soon as this returns; only the encoded copy and thumbnail remain.

/** One captured screen, ready to send and to preview. */
export interface AcquiredCapture {
  image: AssistImage
  thumbnail: string
  display: string
  width: number
  height: number
}

export interface ScreenCapture {
  target(): CaptureDisplay
  acquire(display: CaptureDisplay): Promise<AcquiredCapture>
}

export function createScreenCapture(overlayBounds: () => Rectangle | null): ScreenCapture {
  const desktop = electronDesktop(overlayBounds)
  return {
    target: () => targetDisplay(desktop),
    acquire: async (display) => {
      const captured = await captureDisplay(desktop, display)
      const encoded = encodeForAssistant(captured.image)
      return {
        image: encoded.image,
        thumbnail: thumbnailDataUrl(captured.image),
        display: captured.display,
        width: encoded.width,
        height: encoded.height,
      }
    },
  }
}
