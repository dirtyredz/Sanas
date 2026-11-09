import { expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { inventory } from './assets.mjs'
it('requires the exact three assets and matching metadata, bytes, size and version', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sanas-assets-'))
  const name = 'Sanas-0.1.1-x64-Setup.exe'
  const sha512 = createHash('sha512').update('installer').digest('base64')
  const metadata = { version: '0.1.1', path: name, sha512, files: [{ url: name, sha512, size: 9 }] }
  const save = () => writeFileSync(join(dir, 'latest.yml'), JSON.stringify(metadata))
  try {
    writeFileSync(join(dir, name), 'installer')
    writeFileSync(join(dir, name + '.blockmap'), 'map')
    save()
    expect(inventory(dir, '0.1.1').assets).toHaveLength(3)
    expect(() => inventory(dir, '0.1.2')).toThrow('version')
    writeFileSync(join(dir, name), 'tampered!')
    expect(() => inventory(dir)).toThrow('digest')
    writeFileSync(join(dir, name), 'installer')
    metadata.files[0].size = 10
    save()
    expect(() => inventory(dir)).toThrow('size')
    metadata.files[0].size = 9
    metadata.path = '../unsafe.exe'
    save()
    expect(() => inventory(dir)).toThrow('installer')
    metadata.path = name
    save()
    writeFileSync(join(dir, 'extra.exe'), 'x')
    expect(() => inventory(dir)).toThrow('Unexpected')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
