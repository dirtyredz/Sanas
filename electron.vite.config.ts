import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { sharedAlias } from './vite.alias'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'history-worker': resolve(__dirname, 'src/main/services/history/live/worker.ts'),
        },
      },
    },
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
    // the browser-preview mock (src/renderer/src/dev) is compiled out of the real app
    define: { __SANAS_WEB_PREVIEW__: 'false' },
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        input: {
          // library UI (main window) and the always-on-top overlay are separate pages
          index: resolve(__dirname, 'src/renderer/index.html'),
          overlay: resolve(__dirname, 'src/renderer/overlay.html'),
          interviewer: resolve(__dirname, 'src/renderer/interviewer.html'),
        },
      },
    },
  },
})
