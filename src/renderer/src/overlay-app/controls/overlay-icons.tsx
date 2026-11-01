// Inline 16px stroke glyphs for the overlay rail and header. Local assets only: the overlay
// bundle stays small and works offline.

const base = {
  viewBox: '0 0 16 16',
  width: 16,
  height: 16,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
}

export function IconAnswer(): React.JSX.Element {
  return (
    <svg {...base}>
      <path d="M8 1.8 9.3 6l4.2 1.3-4.2 1.3L8 12.8 6.7 8.6 2.5 7.3 6.7 6z" />
    </svg>
  )
}

export function IconAsk(): React.JSX.Element {
  return (
    <svg {...base}>
      <path d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z" />
      <path d="M6.6 5.9a1.5 1.5 0 1 1 2 1.4c-.4.2-.6.5-.6.9M8 9.4v.1" />
    </svg>
  )
}

export function IconScreen(): React.JSX.Element {
  return (
    <svg {...base}>
      <rect x="1.8" y="2.5" width="12.4" height="8.5" rx="1.2" />
      <path d="M5.5 13.8h5M8 11v2.8" />
    </svg>
  )
}

export function IconSlide(): React.JSX.Element {
  return (
    <svg {...base}>
      <path d="M1.8 2.5h12.4M2.8 2.5v7.5h10.4V2.5M8 10v3.5M5.5 13.8 8 11.5l2.5 2.3" />
    </svg>
  )
}

export function IconTranscript(): React.JSX.Element {
  return (
    <svg {...base}>
      <path d="M2.5 4h2M6.5 4h7M2.5 8h2M6.5 8h5.5M2.5 12h2M6.5 12h6.5" />
    </svg>
  )
}

export function IconContext(): React.JSX.Element {
  return (
    <svg {...base}>
      <path d="M4 1.8h5.5L12.5 5v9.2H4z" />
      <path d="M9.3 1.8V5h3.2M6 8h4.5M6 10.8h4.5" />
    </svg>
  )
}

export function IconGhost(): React.JSX.Element {
  return (
    <svg {...base}>
      <path d="M3.5 14V7a4.5 4.5 0 0 1 9 0v7l-1.5-1.2L9.5 14 8 12.8 6.5 14 5 12.8z" />
      <path d="M6.3 7v.1M9.7 7v.1" />
    </svg>
  )
}

export function IconMore(): React.JSX.Element {
  return (
    <svg {...base}>
      <path d="M3.5 8v.1M8 8v.1M12.5 8v.1" strokeWidth={2.2} />
    </svg>
  )
}
