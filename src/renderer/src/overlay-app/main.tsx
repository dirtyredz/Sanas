import React from 'react'
import ReactDOM from 'react-dom/client'
import { Overlay } from './Overlay'
import './overlay.css'

// Browser preview without Electron (npm run dev:web): stand in for the preload bridge.
// __SANAS_WEB_PREVIEW__ is a build-time constant — true only in vite.renderer.config.ts,
// false in the Electron build — so this is dead code everywhere else.
if (__SANAS_WEB_PREVIEW__ && !('sanas' in window)) {
  const { installMockApi } = await import('../dev/mock-api')
  installMockApi()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Overlay />
  </React.StrictMode>,
)
