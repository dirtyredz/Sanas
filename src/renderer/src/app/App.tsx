import { useEffect, useState } from 'react'
import { SettingsPage } from './pages/SettingsPage'
import { LiveMeetingPage } from './pages/LiveMeetingPage'
import { JobsPage } from './pages/JobsPage'
import { SearchPage } from './pages/SearchPage'
import { AskPage } from './pages/AskPage'
import { useMeetingState } from '../lib/useMeetingState'
import { hotkeyLabel } from '../lib/hotkey-label'
import { IconAsk, IconJobs, IconLive, IconSearch, IconSettings } from '../lib/icons'

type Page = 'live' | 'jobs' | 'search' | 'ask' | 'settings'

const NAV: { page: Page; label: string; icon: () => React.JSX.Element }[] = [
  { page: 'live', label: 'Live', icon: IconLive },
  { page: 'jobs', label: 'Jobs', icon: IconJobs },
  { page: 'search', label: 'Search', icon: IconSearch },
  { page: 'ask', label: 'Ask', icon: IconAsk },
  { page: 'settings', label: 'Settings', icon: IconSettings },
]

export function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('live')
  const [overlayHotkey, setOverlayHotkey] = useState('')
  const state = useMeetingState()
  const live = state.status === 'live'
  const paused = state.status === 'paused'

  useEffect(() => {
    window.sanas.settings.get().then((s) => setOverlayHotkey(hotkeyLabel(s.overlayHotkey)))
  }, [page]) // re-read after a visit to Settings

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <div className="logo">Sanas</div>
          <div className="tagline">whisper · glossary</div>
        </div>
        {NAV.map(({ page: p, label, icon: Icon }) => (
          <button
            key={p}
            className={`nav-item ${page === p ? 'active' : ''}`}
            onClick={() => setPage(p)}
          >
            <Icon />
            {label}
          </button>
        ))}
        <div className="spacer" />
        <div className={`status ${live || paused ? 'live' : ''}`}>
          <span className={`dot ${live ? 'live' : paused ? 'paused' : ''}`} />
          {live
            ? 'Listening'
            : paused
              ? 'Paused'
              : state.status === 'error'
                ? 'Error — see Live'
                : 'Idle'}
        </div>
        <button className="nav-item" onClick={() => window.sanas.overlay.toggle()}>
          Overlay
          {overlayHotkey && <span className="kbd">{overlayHotkey}</span>}
        </button>
      </nav>
      <main className="content">
        {page === 'live' && <LiveMeetingPage />}
        {page === 'jobs' && <JobsPage />}
        {page === 'search' && <SearchPage />}
        {page === 'ask' && <AskPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
