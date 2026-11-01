import { readFileSync } from 'fs'
import { resolve } from 'path'
import { expect, it } from 'vitest'

// The header is the window's title bar (main/windows/window-chrome.ts). Two easy-to-lose
// rules make that work, and losing either one fails silently in a test that renders HTML.
const css = readFileSync(resolve(__dirname, '../styles/shell.css'), 'utf8')

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[2] ?? ''
}

it('makes the header drag the window and keeps it clear of the caption buttons', () => {
  const header = rule('.app-header')
  expect(header).toMatch(/-webkit-app-region:\s*drag/)
  expect(header).toMatch(/env\(titlebar-area-width/)
})

it('lets every header control take clicks instead of dragging the window', () => {
  const noDrag = css.match(/\.app-header :is\(([^)]*)\)\s*\{[^}]*-webkit-app-region:\s*no-drag/)
  expect(noDrag?.[1].split(',').map((s) => s.trim())).toEqual(
    expect.arrayContaining(['button', 'a', 'input', 'select']),
  )
})
