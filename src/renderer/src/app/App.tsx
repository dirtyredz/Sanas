import { useEffect, useState } from 'react'
import { SettingsPage } from './pages/SettingsPage'
import { LiveMeetingPage } from './pages/LiveMeetingPage'
import { JobsPage } from './pages/JobsPage'

type Page = 'live' | 'jobs' | 'settings'

export function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('live')
  const [dbStatus, setDbStatus] = useState<string>('…')

  useEffect(() => {
    window.sanas.db
      .ping()
      .then((r) => setDbStatus(`db ok · ${r.jobs} jobs`))
      .catch((e) => setDbStatus(`db error: ${e.message}`))
  }, [])

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
        <button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}>
          Settings
        </button>
        <div className="spacer" />
        <button onClick={() => window.sanas.overlay.toggle()}>Toggle overlay</button>
        <div className="status">{dbStatus}</div>
      </nav>
      <main className="content">
        {page === 'live' && <LiveMeetingPage />}
        {page === 'jobs' && <JobsPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
