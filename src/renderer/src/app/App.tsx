import { useEffect, useState } from 'react'
import { SettingsPage } from './pages/SettingsPage'

type Page = 'jobs' | 'settings'

export function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('jobs')
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
        {page === 'jobs' && (
          <div className="placeholder">
            <h2>Jobs</h2>
            <p>Job library lands in Phase 2 — context packs, glossary, meetings.</p>
          </div>
        )}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
