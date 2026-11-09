import { useEffect, useRef } from 'react'
import { hasReadableText } from '@shared/live-controls/readable-suggestion'
import type { SuggestionView } from '../../lib/suggestions/whisper-history'

const ACKNOWLEDGED_LIMIT = 600

/** Tells main when each readable answer became visible (selected answers one frame after
 *  commit, so it is a commit proxy, not a paint claim), or that it is hidden / unselected.
 *  Each (answer, state) pair is sent once. Composed in the overlay session, so it runs for
 *  the window's lifetime rather than with whichever view is mounted. */
export function useSuggestionVisibilityAck(
  items: SuggestionView[],
  selected: SuggestionView | null,
): void {
  const acknowledged = useRef(new Set<string>())
  useEffect(() => {
    const frames: number[] = []
    for (const item of items) {
      if (item.error || !hasReadableText(item.text)) continue
      const state =
        item !== selected ? 'unselected' : document.hidden ? 'hidden' : 'frame-after-commit'
      const key = `${item.meetingId}:${item.suggestionId}:${state}`
      if (acknowledged.current.has(key)) continue
      const send = (): void => {
        acknowledged.current.add(key)
        if (acknowledged.current.size > ACKNOWLEDGED_LIMIT)
          acknowledged.current.delete(acknowledged.current.values().next().value!)
        void window.sanas.assist
          .acknowledgeVisibility({ meetingId: item.meetingId, runId: item.suggestionId, state })
          .catch(() => undefined)
      }
      if (state === 'frame-after-commit') frames.push(requestAnimationFrame(send))
      else send()
    }
    return () => frames.forEach(cancelAnimationFrame)
  }, [items, selected])
}
