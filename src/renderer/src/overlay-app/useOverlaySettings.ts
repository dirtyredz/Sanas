import { useEffect, useRef, useState } from 'react'
import { DEFAULT_WHISPER_RATIO } from './overlay-split'
import { createOverlayOpacitySaver } from './overlay-opacity'
export function useOverlaySettings() {
  const [overlayOpacity, setOverlayOpacity] = useState(1)
  const [whisperRatio, setWhisperRatio] = useState(DEFAULT_WHISPER_RATIO)
  const saveSplitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const opacitySaverRef = useRef(
    createOverlayOpacitySaver((opacity) => window.sanas.settings.set({ overlayOpacity: opacity })),
  )
  useEffect(() => {
    let active = true
    void window.sanas.settings.get().then((settings) => {
      if (active) {
        setWhisperRatio(settings.overlayWhisperRatio)
        setOverlayOpacity(settings.overlayOpacity)
      }
    })
    const removeSettingsListener = window.sanas.settings.onChanged((settings) => {
      setOverlayOpacity(settings.overlayOpacity)
    })
    return () => {
      active = false
      removeSettingsListener()
      opacitySaverRef.current.dispose()
      if (saveSplitTimerRef.current) clearTimeout(saveSplitTimerRef.current)
    }
  }, [])

  const persistSplit = (ratio: number): void => {
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
    setOverlayOpacity,
    whisperRatio,
    setWhisperRatio,
    persistSplit,
    opacitySaverRef,
  }
}
