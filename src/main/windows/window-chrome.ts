/** The main window has no native title bar: the in-app header (renderer `.app-header`) is the
 *  title bar, and Windows draws only the min/max/close buttons over its right end
 *  (`titleBarOverlay`), which keeps Snap Layouts on the maximize button.
 *
 *  These values mirror renderer/src/app/styles/tokens.css — `--panel` (the header's
 *  background), `--text` (the glyphs), `--bg` (the page behind the first paint) and
 *  `--app-header-h`. tokens.css is the source of truth; window-chrome.test.ts fails when the
 *  two drift. */
export const MAIN_WINDOW_CHROME = {
  backgroundColor: '#0f1317',
  overlayColor: '#161b21',
  symbolColor: '#e4e8ed',
  /** The header's full height, including its 1px bottom border. */
  headerHeight: 52,
} as const

/** BrowserWindow options that replace the native frame with the in-app header. The caption
 *  buttons stop 1px short of the header so its bottom border runs under them too. */
export function mainWindowChromeOptions(): {
  backgroundColor: string
  titleBarStyle: 'hidden'
  titleBarOverlay: { color: string; symbolColor: string; height: number }
} {
  return {
    backgroundColor: MAIN_WINDOW_CHROME.backgroundColor,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: MAIN_WINDOW_CHROME.overlayColor,
      symbolColor: MAIN_WINDOW_CHROME.symbolColor,
      height: MAIN_WINDOW_CHROME.headerHeight - 1,
    },
  }
}
