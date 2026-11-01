import { useEffect, useRef, useState } from 'react'
import { DEFAULT_ANSWER_RATIO } from './overlay-split'
import { createOverlayOpacitySaver } from './overlay-opacity'

export interface OverlaySettingsModel {
  overlayOpacity: number
  /** Apply at once (main sets the window opacity on save) and persist, coalesced. */
  changeOpacity(opacity: number): void
  answerRatio: number
  setAnswerRatio(ratio: number): void
  persistAnswerRatio(ratio: number): void
}

/** Overlay opacity and the persisted answer-preview ratio (the divider): load, debounced save, and Settings sync. */
export function useOverlaySettings(): OverlaySettingsModel {
  const [overlayOpacity, setOverlayOpacity] = useState(1)
  const [answerRatio, setAnswerRatio] = useState(DEFAULT_ANSWER_RATIO)
  const saveSplitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const opacitySaverRef = useRef(
    createOverlayOpacitySaver((opacity) => window.sanas.settings.set({ overlayOpacity: opacity })),
  )
  useEffect(() => {
    let active = true
    void window.sanas.settings.get().then((settings) => {
      if (active) {
        setAnswerRatio(settings.overlayWhisperRatio)
        setOverlayOpacity(settings.overlayOpacity)
      }
    })
    const removeSettingsListener = window.sanas.settings.onChanged((settings) => {
      setOverlayOpacity(settings.overlayOpacity)
    })
    const saver = opacitySaverRef.current
    return () => {
      active = false
      removeSettingsListener()
      saver.dispose()
      if (saveSplitTimerRef.current) clearTimeout(saveSplitTimerRef.current)
    }
  }, [])

  const persistAnswerRatio = (ratio: number): void => {
    if (saveSplitTimerRef.current) clearTimeout(saveSplitTimerRef.current)
    saveSplitTimerRef.current = setTimeout(() => {
      saveSplitTimerRef.current = null
      void window.sanas.settings
        .set({ overlayWhisperRatio: ratio })
        .catch((error) => console.warn('[sanas] could not save the overlay split:', error))
    }, 400)
  }

  return {
    overlayOpacity,
    changeOpacity: (opacity) => {
      setOverlayOpacity(opacity)
      opacitySaverRef.current.schedule(opacity)
    },
    answerRatio,
    setAnswerRatio,
    persistAnswerRatio,
  }
}
