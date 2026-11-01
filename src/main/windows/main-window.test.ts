import { beforeEach, expect, it, vi } from 'vitest'

const f = vi.hoisted(() => ({
  created: 0,
  minimized: false,
  visible: true,
  restore: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
  loadURL: vi.fn(),
  loadFile: vi.fn(),
  closed: null as (() => void) | null,
}))
vi.mock('electron', () => ({
  BrowserWindow: class {
    constructor() {
      f.created++
    }
    isDestroyed = () => false
    isMinimized = () => f.minimized
    isVisible = () => f.visible
    restore = f.restore
    show = f.show
    focus = f.focus
    loadURL = f.loadURL
    loadFile = f.loadFile
    on(event: string, cb: () => void) {
      if (event === 'closed') f.closed = cb
    }
  },
}))
import { createMainWindow, showMainWindow } from './main-window'

beforeEach(() => {
  f.closed?.()
  f.created = 0
  f.minimized = false
  f.visible = true
  vi.clearAllMocks()
})

it('creates the window once and loads the renderer', () => {
  createMainWindow()
  expect(f.created).toBe(1)
  expect(f.loadURL.mock.calls.length + f.loadFile.mock.calls.length).toBe(1)
})

it('restores, shows and focuses an existing minimized or hidden window without reloading', () => {
  createMainWindow()
  vi.clearAllMocks()
  f.minimized = true
  f.visible = false
  showMainWindow()
  expect(f.created).toBe(1)
  expect(f.restore).toHaveBeenCalledOnce()
  expect(f.show).toHaveBeenCalledOnce()
  expect(f.focus).toHaveBeenCalledOnce()
  expect(f.loadURL).not.toHaveBeenCalled()
  expect(f.loadFile).not.toHaveBeenCalled()
})

it('only focuses a window that is already visible', () => {
  createMainWindow()
  vi.clearAllMocks()
  showMainWindow()
  expect(f.restore).not.toHaveBeenCalled()
  expect(f.show).not.toHaveBeenCalled()
  expect(f.focus).toHaveBeenCalledOnce()
})

it('recreates the window after it was closed', () => {
  createMainWindow()
  f.closed?.()
  showMainWindow()
  expect(f.created).toBe(2)
})
