import { readFileSync } from 'fs'
import { resolve } from 'path'
import { expect, it } from 'vitest'
import { MAIN_WINDOW_CHROME, mainWindowChromeOptions } from './window-chrome'

const tokens = readFileSync(resolve(__dirname, '../../renderer/src/app/styles/tokens.css'), 'utf8')

function token(name: string): string {
  const value = tokens.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]
  if (!value) throw new Error(`tokens.css has no --${name}`)
  return value.trim()
}

// The caption buttons are drawn by Windows, not CSS: if the theme changes and these do not,
// they sit on a mismatched block at the end of the header.
it('matches the caption buttons to the header colours and height in tokens.css', () => {
  expect(MAIN_WINDOW_CHROME.overlayColor).toBe(token('panel'))
  expect(MAIN_WINDOW_CHROME.symbolColor).toBe(token('text'))
  expect(MAIN_WINDOW_CHROME.backgroundColor).toBe(token('bg'))
  expect(`${MAIN_WINDOW_CHROME.headerHeight}px`).toBe(token('app-header-h'))
})

it('hides the native title bar and keeps the caption buttons within the header', () => {
  const options = mainWindowChromeOptions()
  expect(options.titleBarStyle).toBe('hidden')
  expect(options.titleBarOverlay.height).toBeLessThanOrEqual(MAIN_WINDOW_CHROME.headerHeight)
})
