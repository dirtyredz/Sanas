import { readFileSync } from 'fs'
import { join } from 'path'
import { expect, it } from 'vitest'

it('lets the overlay show local capture thumbnails without allowing remote images', () => {
  const html = readFileSync(join(__dirname, '../../../overlay.html'), 'utf-8')
  const csp = html.match(/Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? ''
  const img = csp.split(';').find((d) => d.trim().startsWith('img-src'))
  expect(img?.trim()).toBe("img-src 'self' data:")
  expect(csp).not.toMatch(/https?:|\*/)
})
