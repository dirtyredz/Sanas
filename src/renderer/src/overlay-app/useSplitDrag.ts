import { useRef } from 'react'
import { SPLITTER_HEIGHT, whisperRatioFromHeight } from './overlay-split'
interface SplitSession {
  pointerId: number
  screenY: number
  whisperHeight: number
  containerHeight: number
}

export function useSplitDrag(
  contentHeight: number,
  whisperHeight: number,
  setWhisperMaximized: (value: boolean) => void,
  setWhisperRatio: (value: number) => void,
  persistSplit: (value: number) => void,
) {
  const splitRef = useRef<SplitSession | null>(null)
  const startSplit = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || contentHeight <= SPLITTER_HEIGHT) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    splitRef.current = {
      pointerId: event.pointerId,
      screenY: event.screenY,
      whisperHeight,
      containerHeight: contentHeight,
    }
  }

  const continueSplit = (event: React.PointerEvent<HTMLDivElement>): void => {
    const session = splitRef.current
    if (!session || session.pointerId !== event.pointerId) return
    if (Math.abs(session.screenY - event.screenY) < 3) return
    const ratio = whisperRatioFromHeight(
      session.containerHeight,
      session.whisperHeight + session.screenY - event.screenY,
    )
    setWhisperMaximized(false)
    setWhisperRatio(ratio)
    persistSplit(ratio)
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
