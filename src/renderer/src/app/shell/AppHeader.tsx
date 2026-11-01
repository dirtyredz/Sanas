import type { MeetingState } from '@shared/types'
import { IconOverlay } from '../../lib/icons'
import { describeMeetingStatus } from './meeting-status'
import { NAV, type Page } from './pages'

/** Three teal bars: a quiet voice level, the app's mark. */
function BrandMark(): React.JSX.Element {
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="0.5" y="0.5" width="23" height="23" rx="6.5" />
      <path d="M8 9.5v5M12 7v10M16 10.5v3" />
    </svg>
  )
}

/** The library window's top bar: identity, page navigation, the meeting status and the
 *  overlay toggle with its global hotkey. */
export function AppHeader({
  page,
  onNavigate,
  meeting,
  overlayHotkey,
  onToggleOverlay,
}: {
  page: Page
  onNavigate: (page: Page) => void
  meeting: Pick<MeetingState, 'status' | 'error' | 'captureWarning'>
  overlayHotkey: string
  onToggleOverlay: () => void
}): React.JSX.Element {
  const status = describeMeetingStatus(meeting)
  return (
    <header className="app-header">
      <div className="brand">
        <BrandMark />
        <span className="brand-name">Sanas</span>
      </div>
      <nav className="app-nav" aria-label="Pages">
        {NAV.map(({ page: p, label, icon: Icon }) => (
          <button
            key={p}
            type="button"
            className={`app-nav-item${page === p ? ' active' : ''}`}
            aria-current={page === p ? 'page' : undefined}
            title={label}
            onClick={() => onNavigate(p)}
          >
            <Icon />
            <span className="app-nav-label">{label}</span>
          </button>
        ))}
      </nav>
      <div className="app-header-actions">
        <button
          type="button"
          className={`meeting-pill meeting-pill--${status.tone}`}
          title={`${status.detail} Open Live.`}
          onClick={() => onNavigate('live')}
        >
          <span className={`dot ${status.tone}`} aria-hidden="true" />
          <span role="status">{status.label}</span>
        </button>
        <button
          type="button"
          className="btn btn-sm overlay-toggle"
          title="Show or hide the overlay"
          onClick={onToggleOverlay}
        >
          <IconOverlay />
          <span className="overlay-toggle-label">Overlay</span>
          {overlayHotkey && <kbd className="kbd">{overlayHotkey}</kbd>}
        </button>
      </div>
    </header>
  )
}
