import { useState } from 'react'
import { SettingsPage } from './pages/SettingsPage'
import { LiveMeetingPage } from './pages/LiveMeetingPage'
import { JobsPage } from './pages/JobsPage'
import { SearchPage } from './pages/SearchPage'

type Page = 'live' | 'jobs' | 'search' | 'settings'

export function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('live')

  return (
    <div className="app">
      <nav className="sidebar">
        <h1 className="logo">Sanas</h1>
        <button className={page === 'live' ? 'active' : ''} onClick={() => setPage('live')}>
          Live
        </button>
        <button className={page === 'jobs' ? 'active' : ''} onClick={() => setPage('jobs')}>
          Jobs
        </button>
        <button className={page === 'search' ? 'active' : ''} onClick={() => setPage('search')}>
          Search
        </button>
        <button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}>
          Settings
        </button>
        <div className="spacer" />
        <button onClick={() => window.sanas.overlay.toggle()}>Toggle overlay</button>
      </nav>
      <main className="content">
        {page === 'live' && <LiveMeetingPage />}
        {page === 'jobs' && <JobsPage />}
        {page === 'search' && <SearchPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
