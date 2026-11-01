import { beforeEach, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({
  show: vi.fn(),
  inactive: vi.fn(),
  focus: vi.fn(),
  send: vi.fn(),
  ignore: vi.fn(),
  protect: vi.fn(),
  blur: vi.fn(),
  ready: null as (() => void) | null,
  closed: null as (() => void) | null,
}))
vi.mock('electron', () => ({
  screen: {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1536, height: 864 } }),
    getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1536, height: 864 } }],
    on() {},
    removeListener() {},
  },
  BrowserWindow: class {
    webContents = { send: f.send }
    setContentProtection = f.protect
    setAlwaysOnTop() {}
    setOpacity() {}
    loadFile() {}
    loadURL() {}
    isDestroyed() {
      return false
    }
    isVisible() {
      return false
    }
    show = f.show
    showInactive = f.inactive
    focus = f.focus
    blur = f.blur
    setIgnoreMouseEvents = f.ignore
    once(_event: string, cb: () => void) {
      f.ready = cb
    }
    on(event: string, cb: () => void) {
      if (event === 'closed') f.closed = cb
    }
  },
}))
vi.mock('../config/settings', () => ({
  loadSettings: () => ({ overlayBounds: null, overlayOpacity: 1 }),
  saveSettings: vi.fn(),
}))
vi.mock('@shared/ipc', () => ({ IPC: { ComposeFocus: 'compose', OverlayGhostState: 'ghost' } }))
import {
  activateComposer,
  composerReady,
  releaseOverlayFocus,
  setClickThrough,
  showOverlay,
} from './overlay-window'
beforeEach(() => {
  f.closed?.()
  vi.clearAllMocks()
})
it('always excludes the overlay from screen capture', () => {
  showOverlay()
  expect(f.protect).toHaveBeenCalledOnce()
  expect(f.protect).toHaveBeenCalledWith(true)
})
it('passive reveal never focuses', () => {
  showOverlay()
  f.ready?.()
  expect(f.inactive).toHaveBeenCalled()
  expect(f.focus).not.toHaveBeenCalled()
  expect(f.show).not.toHaveBeenCalled()
})
it('explicit activation clears ghost, focuses, and retains first-load intent until ready once', () => {
  setClickThrough(true)
  activateComposer()
  expect(f.ignore).toHaveBeenCalledWith(false, { forward: true })
  expect(f.focus).toHaveBeenCalledOnce()
  expect(f.send).not.toHaveBeenCalledWith('compose')
  composerReady()
  composerReady()
  expect(f.send.mock.calls.filter((c) => c[0] === 'compose')).toHaveLength(1)
  releaseOverlayFocus()
  expect(f.blur).toHaveBeenCalledOnce()
})
