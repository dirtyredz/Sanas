import { useRef } from 'react'
import type { OverlayResizeRequest } from '@shared/types'
type ResizeAxis = 'right' | 'bottom' | 'corner'

interface ResizeSession {
  pointerId: number
  axis: ResizeAxis
  screenX: number
  screenY: number
  width: number
  height: number
}

export function useOverlayResize() {
  const resizeRef = useRef<ResizeSession | null>(null)
  const startResize = (axis: ResizeAxis, event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = {
      pointerId: event.pointerId,
      axis,
      screenX: event.screenX,
      screenY: event.screenY,
      width: window.innerWidth,
      height: window.innerHeight,
    }
  }

  const continueResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    const session = resizeRef.current
    if (!session || session.pointerId !== event.pointerId) return
    const request: OverlayResizeRequest = {}
    if (session.axis !== 'bottom') {
      request.width = Math.round(session.width + event.screenX - session.screenX)
    }
    if (session.axis !== 'right') {
      request.height = Math.round(session.height + event.screenY - session.screenY)
    }
    if ((request.width ?? 1) > 0 && (request.height ?? 1) > 0) {
      void window.sanas.overlay.resize(request)
    }
  }

  const stopResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (resizeRef.current?.pointerId !== event.pointerId) return
    resizeRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return { startResize, continueResize, stopResize }
}
