// Inline 16px stroke icons for the shell and toolbars. Kept tiny and local: four
// nav glyphs and two capture-source glyphs are not worth an icon dependency.

const base = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function IconLive(): React.JSX.Element {
  return (
    <svg {...base}>
      <path d="M2 8h1.5l1.5-4 2 8 2-6 1.5 3H14" />
    </svg>
  )
}

export function IconJobs(): React.JSX.Element {
  return (
    <svg {...base}>
      <rect x="2" y="5" width="12" height="8.5" rx="1.5" />
      <path d="M6 5V3.5A1 1 0 0 1 7 2.5h2a1 1 0 0 1 1 1V5M2 8.5h12" />
    </svg>
  )
}

export function IconSearch(): React.JSX.Element {
  return (
    <svg {...base}>
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.3 10.3 3.2 3.2" />
    </svg>
  )
}

export function IconSettings(): React.JSX.Element {
  return (
    <svg {...base}>
      <path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7" />
      <circle cx="10.5" cy="4.5" r="1.75" />
      <circle cx="5.5" cy="11.5" r="1.75" />
    </svg>
  )
}

export function IconLaptop(): React.JSX.Element {
  return (
    <svg {...base}>
      <rect x="3" y="3.5" width="10" height="7" rx="1" />
      <path d="M1.5 12.5h13" />
    </svg>
  )
}

export function IconPeople(): React.JSX.Element {
  return (
    <svg {...base}>
      <circle cx="6" cy="5.5" r="2.25" />
      <path d="M2 13c0-2.2 1.8-3.75 4-3.75s4 1.55 4 3.75" />
      <circle cx="11.5" cy="6" r="1.75" />
      <path d="M11 9.75c1.8 0 3 1.3 3 3" />
    </svg>
  )
}
