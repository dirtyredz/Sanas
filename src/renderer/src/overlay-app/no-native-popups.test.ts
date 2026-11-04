import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { expect, it } from 'vitest'

// The overlay window is excluded from screen capture (setContentProtection), but native
// tooltips, <select> popups and pickers are separate OS windows that are NOT, so they leak
// into shares. Use OverlayTip / in-DOM controls instead. See docs/GOTCHAS.md.
const FORBIDDEN: Array<[string, RegExp]> = [
  ['native title= tooltip (use OverlayTip)', /\btitle\s*=/],
  ['native <select> (use an in-DOM listbox)', /<select\b/i],
  ['native <datalist>', /<datalist\b/i],
  [
    'native date/color/time picker input',
    /type\s*=\s*["'{]\s*["']?(date|datetime-local|month|week|time|color)\b/i,
  ],
  ['native context menu handler', /onContextMenu\b/],
  ['native alert/confirm/prompt dialog', /(?<![\w.])(window\.)?(alert|confirm|prompt)\s*\(/],
]

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

it('keeps native popup-window UI out of the overlay (it leaks into screen shares)', () => {
  const hits: string[] = []
  for (const file of sources(__dirname)) {
    readFileSync(file, 'utf-8')
      .split('\n')
      .forEach((line, i) => {
        for (const [what, re] of FORBIDDEN) {
          if (re.test(line)) hits.push(`${file.slice(__dirname.length + 1)}:${i + 1} ${what}`)
        }
      })
  }
  expect(hits).toEqual([])
})
