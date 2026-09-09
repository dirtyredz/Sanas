import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/index.css'

// Browser preview without Electron (electron-vite dev --rendererOnly): stand in for the
// preload bridge. Dead code in production builds — DEV is a compile-time constant.
if (import.meta.env.DEV && !('sanas' in window)) {
  const { installMockApi } = await import('../dev/mock-api')
  installMockApi()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
