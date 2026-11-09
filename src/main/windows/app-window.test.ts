import { afterEach, expect, it, vi } from 'vitest'

const f = vi.hoisted(() => ({
  options: null as Record<string, unknown> | null,
  loadURL: vi.fn((_url: string) => Promise.resolve()),
  loadFile: vi.fn((_file: string) => Promise.resolve()),
}))
vi.mock('electron', () => ({
  BrowserWindow: class {
    constructor(o: Record<string, unknown>) {
      f.options = o
    }
    loadURL = f.loadURL
    loadFile = f.loadFile
  },
}))
import { appWebPreferences, createAppWindow, loadAppPage } from './app-window'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

it('applies the shared security preferences and keeps per-window options', () => {
  createAppWindow({
    window: { width: 10, frame: false, transparent: true },
    extraPreferences: { backgroundThrottling: false },
  })
  expect(f.options).toMatchObject({ width: 10, frame: false, transparent: true })
  const prefs = f.options!.webPreferences as Record<string, unknown>
  expect(prefs).toMatchObject({
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    backgroundThrottling: false,
  })
  expect(String(prefs.preload).replace(/\\/g, '/')).toMatch(/preload\/index\.js$/)
})

it('keeps isolation on by default', () => {
  expect(appWebPreferences().contextIsolation).toBe(true)
  expect(appWebPreferences().nodeIntegration).toBe(false)
})

it('loads the dev server URL when ELECTRON_RENDERER_URL is set', async () => {
  vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173')
  const w = createAppWindow({ window: {} })
  await loadAppPage(w, 'overlay.html')
  expect(f.loadURL).toHaveBeenCalledWith('http://localhost:5173/overlay.html')
  expect(f.loadFile).not.toHaveBeenCalled()
})

it('loads the packaged renderer file otherwise', async () => {
  const w = createAppWindow({ window: {} })
  await loadAppPage(w, 'index.html')
  expect(f.loadURL).not.toHaveBeenCalled()
  expect(String(f.loadFile.mock.calls[0]![0]).replace(/\\/g, '/')).toMatch(/renderer\/index\.html$/)
})
