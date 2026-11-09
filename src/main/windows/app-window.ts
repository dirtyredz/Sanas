import { BrowserWindow, type BrowserWindowConstructorOptions, type WebPreferences } from 'electron'
import { join } from 'node:path'

/** Per-window webPreferences that may be added on top of the shared security baseline. */
export type AppWindowExtraPreferences = Pick<
  WebPreferences,
  'backgroundThrottling' | 'autoplayPolicy'
>

export interface AppWindowOptions {
  /** Per-window BrowserWindow options (size, frame, title...). `webPreferences` is not
   *  accepted: security settings are defined here once. */
  window: Omit<BrowserWindowConstructorOptions, 'webPreferences'>
  extraPreferences?: AppWindowExtraPreferences
}

/** The one place window security settings live. The preload is the only bridge to the
 *  main process; `sandbox: false` because it uses require for electron APIs, while the
 *  renderer itself stays isolated (contextIsolation on, no node integration). */
export function appWebPreferences(extra: AppWindowExtraPreferences = {}): WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    ...extra,
  }
}

export function createAppWindow(opts: AppWindowOptions): BrowserWindow {
  return new BrowserWindow({
    ...opts.window,
    webPreferences: appWebPreferences(opts.extraPreferences),
  })
}

/** Dev server (ELECTRON_RENDERER_URL) vs the packaged renderer file; `page` is e.g. 'index.html'. */
export function loadAppPage(window: BrowserWindow, page: string): Promise<void> {
  return process.env.ELECTRON_RENDERER_URL
    ? window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${page}`)
    : window.loadFile(join(__dirname, '../renderer', page))
}
