import { useId, useState, type ReactNode } from 'react'

const MARGIN = 6
const GAP = 6

/** Place the tip under (or, without room, over) the anchor and clamp it inside the window, so
 *  it never overflows the small overlay. */
function place(tip: HTMLElement, anchor: DOMRect): void {
  const { width, height } = tip.getBoundingClientRect()
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight
  const below = anchor.bottom + GAP
  const top = below + height + MARGIN <= vh ? below : Math.max(MARGIN, anchor.top - GAP - height)
  const centred = anchor.left + anchor.width / 2 - width / 2
  const left = Math.max(MARGIN, Math.min(centred, vw - width - MARGIN))
  tip.style.top = `${top}px`
  tip.style.left = `${left}px`
  tip.style.visibility = 'visible'
}

/** A tooltip drawn inside the overlay's own DOM. Native `title` tooltips are separate OS
 *  windows that content protection does not cover, so they show up in screen shares.
 *  The wrapper is `display: contents`, so it does not affect layout; the tip anchors to its
 *  single child. Pair icon-only children with an aria-label. */
export function OverlayTip({
  text,
  children,
}: {
  text: string
  children: ReactNode
}): React.JSX.Element {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const id = useId()
  const show = (e: React.SyntheticEvent<HTMLElement>): void => {
    const child = e.currentTarget.firstElementChild
    setAnchor((child ?? e.currentTarget).getBoundingClientRect())
  }
  const hide = (): void => setAnchor(null)
  return (
    <span
      className="ov-tip-host"
      aria-describedby={anchor ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(e) => e.key === 'Escape' && hide()}
      onMouseDown={hide}
    >
      {children}
      {anchor && (
        <span
          id={id}
          role="tooltip"
          className="ov-tip"
          ref={(el) => {
            if (el) place(el, anchor)
          }}
        >
          {text}
        </span>
      )}
    </span>
  )
}
