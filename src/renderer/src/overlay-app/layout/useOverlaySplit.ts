import { useEffect, useRef, useState } from 'react'
import { DIVIDER_HEIGHT, DIVIDER_STEP, answerRatioFromHeight, overlaySplit } from './overlay-split'
import { useSplitDrag } from './useSplitDrag'

/** Measures the content column and turns the persisted answer ratio into grid rows plus the
 *  divider's pointer and keyboard handlers. In Answer mode the answer takes the whole column. */
export function useOverlaySplit(
  answerRatio: number,
  setAnswerRatio: (ratio: number) => void,
  persistAnswerRatio: (ratio: number) => void,
  fullAnswer: boolean,
) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const measure = (): void => setContentHeight(content.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])
  const split = overlaySplit(contentHeight, answerRatio)
  const rows = fullAnswer
    ? 'minmax(0, 1fr) 0 0'
    : contentHeight > 0
      ? `${split.previewHeight}px ${DIVIDER_HEIGHT}px ${split.workspaceHeight}px`
      : undefined
  const { startSplit, continueSplit, stopSplit } = useSplitDrag(
    contentHeight,
    split.previewHeight,
    setAnswerRatio,
    persistAnswerRatio,
  )
  const step = (delta: number): void => {
    const ratio = answerRatioFromHeight(contentHeight, split.previewHeight + delta)
    setAnswerRatio(ratio)
    persistAnswerRatio(ratio)
  }
  return {
    contentRef,
    rows,
    dividerProps: {
      'aria-valuenow': Math.round(split.ratio * 100),
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      onPointerDown: startSplit,
      onPointerMove: continueSplit,
      onPointerUp: stopSplit,
      onPointerCancel: stopSplit,
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
        event.preventDefault()
        step(event.key === 'ArrowDown' ? DIVIDER_STEP : -DIVIDER_STEP)
      },
    },
  }
}
