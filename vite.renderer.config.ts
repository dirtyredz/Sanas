import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Renderer-only dev server for previewing the UI in a plain browser, with no Electron
// (`npm run dev:web`). src/renderer/src/dev/mock-api.ts stands in for the preload
// bridge. The real app is still built and run by electron.vite.config.ts.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  define: { __SANAS_WEB_PREVIEW__: 'true' },
  server: { port: 5174, strictPort: true },
})
