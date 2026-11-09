import { MockInterviewPage } from './pages/MockInterviewPage'
import { useEffect, useState } from 'react'
import { SettingsPage } from './pages/SettingsPage'
import { LiveMeetingPage } from './pages/LiveMeetingPage'
import { JobsPage } from './pages/JobsPage'
import { SearchPage } from './pages/SearchPage'
import { AskPage } from './pages/AskPage'
import { AppHeader } from './shell/AppHeader'
import type { Page } from './shell/pages'
import { useMeetingState } from '../lib/meeting/useMeetingState'
import { hotkeyLabel } from '../lib/format/hotkey-label'

export function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('live')
  const [overlayHotkey, setOverlayHotkey] = useState('')
  const state = useMeetingState()

  useEffect(() => {
    window.sanas.settings.get().then((s) => setOverlayHotkey(hotkeyLabel(s.overlayHotkey)))
  }, [page]) // re-read after a visit to Settings

  return (
    <div className="app">
      <AppHeader
        page={page}
        onNavigate={setPage}
        meeting={state}
        overlayHotkey={overlayHotkey}
        onToggleOverlay={() => window.sanas.overlay.toggle()}
      />
      <main className={`content content--${page}`}>
        <div className="live-page-host" hidden={page !== 'live'}>
          <LiveMeetingPage visible={page === 'live'} />
        </div>
        <div hidden={page !== 'mock'}>
          <MockInterviewPage visible={page === 'mock'} onSettings={() => setPage('settings')} />
        </div>
        {page === 'jobs' && <JobsPage />}
        {page === 'search' && <SearchPage />}
        {page === 'ask' && <AskPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
