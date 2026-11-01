import { useEffect, useRef, useState } from 'react'
import { MAXIMIZED_TRANSCRIPT_HEIGHT, SPLITTER_HEIGHT, overlaySplit } from './overlay-split'
import { useSplitDrag } from './useSplitDrag'

/** Measures the content area and turns the persisted ratio into grid rows plus the
 *  splitter's pointer handlers. */
export function useOverlaySplit(
  whisperRatio: number,
  setWhisperRatio: (ratio: number) => void,
  persistSplit: (ratio: number) => void,
) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const measure = (): void => setContentHeight(content.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])
  const split = overlaySplit(contentHeight, whisperRatio)
  const transcriptHeight = maximized
    ? Math.min(MAXIMIZED_TRANSCRIPT_HEIGHT, Math.max(0, contentHeight - SPLITTER_HEIGHT))
    : split.transcriptHeight
  const whisperHeight = Math.max(0, contentHeight - SPLITTER_HEIGHT - transcriptHeight)
  const rows =
    contentHeight > 0 ? `${transcriptHeight}px ${SPLITTER_HEIGHT}px ${whisperHeight}px` : undefined
  const { startSplit, continueSplit, stopSplit } = useSplitDrag(
    contentHeight,
    whisperHeight,
    setMaximized,
    setWhisperRatio,
    persistSplit,
  )
  return {
    contentRef,
    rows,
    maximized,
    splitterProps: {
      onDoubleClick: () => setMaximized((value) => !value),
      onPointerDown: startSplit,
      onPointerMove: continueSplit,
      onPointerUp: stopSplit,
      onPointerCancel: stopSplit,
    },
  }
}
