import { afterEach, beforeEach, expect, it } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PACK_FILE_MAX_BYTES, PACK_FILES_MAX, listPackFiles, readPackFile } from './pack-files'

let root: string
let packs: string
let outside: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sanas-'))
  outside = mkdtempSync(join(tmpdir(), 'sanas-out-'))
  packs = join(root, 'job-hunt', 'sanas')
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

function makePacks(): void {
  mkdirSync(packs, { recursive: true })
}

/** Whether this machine can create directory links (Windows needs a junction). */
function canLink(): boolean {
  const probeDir = mkdtempSync(join(tmpdir(), 'sanas-link-'))
  try {
    mkdirSync(join(probeDir, 'target'))
    symlinkSync(
      join(probeDir, 'target'),
      join(probeDir, 'link'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    return true
  } catch {
    return false
  } finally {
    rmSync(probeDir, { recursive: true, force: true })
  }
}

const linkable = canLink()
const caseSensitive = process.platform !== 'win32' && process.platform !== 'darwin'

it('reports a missing root as missing without creating anything', async () => {
  const gone = join(root, 'nope')
  const listing = await listPackFiles(gone)
  expect(listing).toMatchObject({ state: 'missing', files: [], limited: false })
  expect(existsSync(gone)).toBe(false)
})

it('reports a missing pack folder as missing and does not create it', async () => {
  const listing = await listPackFiles(root)
  expect(listing).toMatchObject({ state: 'missing', files: [] })
  expect(existsSync(join(root, 'job-hunt'))).toBe(false)
  expect(existsSync(packs)).toBe(false)
})

it('lists valid files, flags invalid JSON and unsafe names, ignores other extensions', async () => {
  makePacks()
  writeFileSync(join(packs, 'good.json'), JSON.stringify({ a: 1 }))
  writeFileSync(join(packs, 'broken.json'), '{ nope')
  writeFileSync(join(packs, 'notes.txt'), 'ignored')
  writeFileSync(join(packs, 'bad name.json'), '{}')
  const listing = await listPackFiles(root)
  expect(listing.state).toBe('ok')
  expect(listing.files.map((f) => f.stem).sort()).toEqual(['bad name', 'broken', 'good'])
  const byStem = Object.fromEntries(listing.files.map((f) => [f.stem, f]))
  expect(byStem.good).toEqual({ stem: 'good', ok: true, raw: { a: 1 } })
  expect(byStem.broken).toMatchObject({ ok: false, error: 'The pack is not valid JSON.' })
  expect(byStem['bad name']).toMatchObject({ ok: false, error: 'Unsafe pack file name.' })
})

it('refuses a file over 2 MiB without parsing it', async () => {
  makePacks()
  writeFileSync(join(packs, 'huge.json'), Buffer.alloc(PACK_FILE_MAX_BYTES + 1, 0x20))
  const listing = await listPackFiles(root)
  expect(listing.files).toEqual([
    { stem: 'huge', ok: false, error: 'The pack is larger than 2 MiB.', retryable: false },
  ])
})

it('accepts a file of exactly 2 MiB', async () => {
  makePacks()
  const body = '{}'.padEnd(PACK_FILE_MAX_BYTES, ' ')
  writeFileSync(join(packs, 'edge.json'), body)
  const listing = await listPackFiles(root)
  expect(listing.files[0]).toMatchObject({ stem: 'edge', ok: true })
})

it('refuses a directory named like a pack', async () => {
  makePacks()
  mkdirSync(join(packs, 'x.json'))
  const listing = await listPackFiles(root)
  expect(listing.files).toEqual([
    { stem: 'x', ok: false, error: 'Not a regular file.', retryable: false },
  ])
})

it.skipIf(!linkable)('refuses a pack folder that links outside the root', async () => {
  mkdirSync(join(root, 'job-hunt'))
  writeFileSync(join(outside, 'evil.json'), '{}')
  symlinkSync(outside, packs, process.platform === 'win32' ? 'junction' : 'dir')
  const listing = await listPackFiles(root)
  expect(listing.state).toBe('unreadable')
  expect(listing.files).toEqual([])
})

it.skipIf(!linkable)('refuses a pack file that links outside the pack folder', async () => {
  makePacks()
  const target = join(outside, 'secret.json')
  writeFileSync(target, '{"leak":true}')
  try {
    symlinkSync(target, join(packs, 'escape.json'), 'file')
  } catch {
    return // file symlinks may need extra privilege on Windows
  }
  const listing = await listPackFiles(root)
  const entry = listing.files.find((f) => f.stem === 'escape')
  expect(entry?.ok).toBe(false)
  expect(JSON.stringify(listing)).not.toContain('leak')
})

it('readPackFile refuses an unsafe application ID', async () => {
  makePacks()
  const result = await readPackFile(root, '../evil')
  expect(result.ok).toBe(false)
})

it('readPackFile reads a listed pack', async () => {
  makePacks()
  writeFileSync(join(packs, 'acme.json'), '{"a":2}')
  expect(await readPackFile(root, 'acme')).toEqual({ stem: 'acme', ok: true, raw: { a: 2 } })
})

it('readPackFile reports a file deleted after listing as retryable', async () => {
  makePacks()
  writeFileSync(join(packs, 'acme.json'), '{}')
  await listPackFiles(root)
  unlinkSync(join(packs, 'acme.json'))
  const result = await readPackFile(root, 'acme')
  expect(result).toMatchObject({ ok: false, retryable: true })
})

it('tolerates a UTF-8 BOM', async () => {
  makePacks()
  writeFileSync(
    join(packs, 'bom.json'),
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"a":3}')]),
  )
  const listing = await listPackFiles(root)
  expect(listing.files[0]).toEqual({ stem: 'bom', ok: true, raw: { a: 3 } })
})

it('limits the listing to the file bound (default PACK_FILES_MAX) and says so', async () => {
  expect(PACK_FILES_MAX).toBe(500)
  makePacks()
  for (let i = 0; i < 4; i++) {
    writeFileSync(join(packs, `p${String(i).padStart(4, '0')}.json`), '{}')
  }
  const listing = await listPackFiles(root, 3)
  expect(listing.limited).toBe(true)
  expect(listing.files).toHaveLength(3)
})

it('does not set limited at exactly the file bound', async () => {
  makePacks()
  for (let i = 0; i < 3; i++) {
    writeFileSync(join(packs, `p${String(i).padStart(4, '0')}.json`), '{}')
  }
  const listing = await listPackFiles(root, 3)
  expect(listing.limited).toBe(false)
  expect(listing.files).toHaveLength(3)
})

it.skipIf(!caseSensitive)('marks IDs that differ only by case as duplicates', async () => {
  makePacks()
  writeFileSync(join(packs, 'Acme.json'), '{}')
  writeFileSync(join(packs, 'acme.json'), '{}')
  const listing = await listPackFiles(root)
  expect(listing.files).toHaveLength(2)
  for (const file of listing.files) {
    expect(file).toMatchObject({ ok: false, error: 'Duplicate application ID.' })
  }
})
