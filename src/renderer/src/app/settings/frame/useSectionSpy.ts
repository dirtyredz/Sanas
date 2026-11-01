import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  activeSectionId,
  sectionAnchor,
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from './settings-sections'

/** A section counts as "current" once its top is this far into the scroll area. */
const THRESHOLD_PX = 96

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
  }
  return null
}

/** Tracks which Settings section is in view inside the page's scroll container, and scrolls
 *  to one on request. A jump pins its target until the user scrolls by hand, so a short last
 *  section stays selected after clicking it. */
export function useSectionSpy(
  rootRef: RefObject<HTMLElement | null>,
  ready: boolean,
): [SettingsSectionId, (id: SettingsSectionId) => void] {
  const [active, setActive] = useState<SettingsSectionId>(SETTINGS_SECTIONS[0].id)
  const pinned = useRef<SettingsSectionId | null>(null)

  useEffect(() => {
    const scroller = scrollParent(rootRef.current)
    if (!scroller) return
    const measure = (): void => {
      if (pinned.current) return
      const top = scroller.getBoundingClientRect().top
      const positions = SETTINGS_SECTIONS.flatMap(({ id }) => {
        const el = document.getElementById(sectionAnchor(id))
        return el ? [{ id, top: el.getBoundingClientRect().top - top }] : []
      })
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
      const next = activeSectionId(positions, THRESHOLD_PX, atBottom)
      if (next) setActive(next)
    }
    const unpin = (): void => {
      pinned.current = null
    }
    measure()
    scroller.addEventListener('scroll', measure, { passive: true })
    scroller.addEventListener('wheel', unpin, { passive: true })
    scroller.addEventListener('pointerdown', unpin)
    scroller.addEventListener('keydown', unpin)
    return () => {
      scroller.removeEventListener('scroll', measure)
      scroller.removeEventListener('wheel', unpin)
      scroller.removeEventListener('pointerdown', unpin)
      scroller.removeEventListener('keydown', unpin)
    }
  }, [rootRef, ready])

  const jumpTo = useCallback((id: SettingsSectionId) => {
    const el = document.getElementById(sectionAnchor(id))
    if (!el) return
    pinned.current = id
    setActive(id)
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
    // keyboard users continue tabbing from the section they chose
    el.focus({ preventScroll: true })
  }, [])

  return [active, jumpTo]
}
