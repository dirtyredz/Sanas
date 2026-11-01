import { useRef } from 'react'
import { DIVIDER_HEIGHT, answerRatioFromHeight } from './overlay-split'

interface SplitSession {
  pointerId: number
  screenY: number
  previewHeight: number
  containerHeight: number
}

/** Pointer handlers for the divider: dragging down grows the answer preview above it. */
export function useSplitDrag(
  contentHeight: number,
  previewHeight: number,
  setRatio: (value: number) => void,
  persistRatio: (value: number) => void,
) {
  const splitRef = useRef<SplitSession | null>(null)
  const startSplit = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || contentHeight <= DIVIDER_HEIGHT) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    splitRef.current = {
      pointerId: event.pointerId,
      screenY: event.screenY,
      previewHeight,
      containerHeight: contentHeight,
    }
  }

  const continueSplit = (event: React.PointerEvent<HTMLDivElement>): void => {
    const session = splitRef.current
    if (!session || session.pointerId !== event.pointerId) return
    if (Math.abs(session.screenY - event.screenY) < 3) return
    const ratio = answerRatioFromHeight(
      session.containerHeight,
      session.previewHeight + event.screenY - session.screenY,
    )
    setRatio(ratio)
    persistRatio(ratio)
  }

  const stopSplit = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (splitRef.current?.pointerId !== event.pointerId) return
    splitRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return { startSplit, continueSplit, stopSplit }
}
