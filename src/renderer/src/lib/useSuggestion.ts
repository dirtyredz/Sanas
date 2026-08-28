import { useEffect, useState } from 'react'
import type { SuggestionEvent } from '@shared/types'

export interface SuggestionView {
  trigger: 'ambient' | 'hotkey'
  text: string
  streaming: boolean
  error: string | null
}

/** Subscribes to the current (latest) streaming suggestion. */
export function useSuggestion(): SuggestionView | null {
  const [view, setView] = useState<SuggestionView | null>(null)

  useEffect(() => {
    let currentId = -1
    return window.sanas.assist.onSuggestion((ev: SuggestionEvent) => {
      if (ev.kind === 'error') {
        setView({ trigger: ev.trigger, text: '', streaming: false, error: ev.text })
        return
      }
      if (ev.suggestionId !== currentId) {
        // new suggestion starts — replace whatever was showing
        currentId = ev.suggestionId
        setView({ trigger: ev.trigger, text: '', streaming: true, error: null })
      }
      if (ev.kind === 'delta') {
        setView((prev) =>
          prev ? { ...prev, text: prev.text + ev.text, streaming: true } : prev
        )
      } else if (ev.kind === 'done') {
        setView({ trigger: ev.trigger, text: ev.text, streaming: false, error: null })
      }
    })
  }, [])

  return view
}
