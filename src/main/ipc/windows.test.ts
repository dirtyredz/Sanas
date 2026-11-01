import { beforeEach, expect, it, vi } from 'vitest'

const f = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  duplicates: [] as string[],
  showMain: vi.fn(),
  resize: vi.fn(),
  clickThrough: vi.fn(),
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle(channel: string, fn: (...args: unknown[]) => unknown) {
      if (f.handlers.has(channel)) f.duplicates.push(channel)
      f.handlers.set(channel, fn)
    },
  },
}))
vi.mock('@shared/ipc', () => ({
  IPC: {
    OverlayToggle: 'toggle',
    OverlayResize: 'resize',
    OverlayClickThrough: 'click-through',
    ComposeActivate: 'compose-activate',
    ComposeReady: 'compose-ready',
    ComposeRelease: 'compose-release',
    MainWindowShow: 'main-show',
  },
}))
vi.mock('../windows/main-window', () => ({ showMainWindow: f.showMain }))
vi.mock('../windows/overlay-window', () => ({
  activateComposer: vi.fn(),
  composerReady: vi.fn(),
  releaseOverlayFocus: vi.fn(),
  resizeOverlay: f.resize,
  setClickThrough: f.clickThrough,
  toggleOverlay: vi.fn(),
}))
import { registerWindowsIpc } from './windows'

beforeEach(() => {
  f.handlers.clear()
  f.duplicates.length = 0
  vi.clearAllMocks()
  registerWindowsIpc()
})

it('registers each window handler exactly once', () => {
  expect([...f.handlers.keys()].sort()).toEqual(
    [
      'toggle',
      'resize',
      'click-through',
      'compose-activate',
      'compose-ready',
      'compose-release',
      'main-show',
    ].sort(),
  )
  expect(f.duplicates).toEqual([])
})

it('reveals the main window with nothing taken from the renderer', () => {
  f.handlers.get('main-show')!({}, 'settings', { reload: true })
  expect(f.showMain).toHaveBeenCalledWith()
})

it('keeps resize and click-through validation', () => {
  expect(() => f.handlers.get('resize')!({}, { width: 'wide' })).toThrow()
  expect(() => f.handlers.get('click-through')!({}, 'yes')).toThrow()
  expect(f.resize).not.toHaveBeenCalled()
  expect(f.clickThrough).not.toHaveBeenCalled()
  f.handlers.get('click-through')!({}, true)
  expect(f.clickThrough).toHaveBeenCalledWith(true)
})
