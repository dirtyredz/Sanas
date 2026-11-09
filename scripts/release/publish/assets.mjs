import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import yaml from 'js-yaml'
import { parseTag } from './version.mjs'

export function inventory(folder, expectedVersion) {
  const metadata = yaml.load(readFileSync(join(folder, 'latest.yml'), 'utf8'))
  const version = metadata?.version
  if (!parseTag('v' + version) || (expectedVersion && version !== expectedVersion))
    throw new Error('Metadata version mismatch')
  const installer = 'Sanas-' + version + '-x64-Setup.exe'
  if (
    metadata.path !== installer ||
    metadata.files?.length !== 1 ||
    metadata.files[0].url !== installer
  )
    throw new Error('Metadata installer mismatch')
  const names = [installer, installer + '.blockmap', 'latest.yml']
  const actual = readdirSync(folder)
    .filter((n) => /\.(exe|blockmap)$/.test(n) || n === 'latest.yml')
    .sort()
  if (JSON.stringify(actual) !== JSON.stringify([...names].sort()))
    throw new Error('Unexpected release assets')
  const assets = names.map((name) => ({ name, bytes: readFileSync(join(folder, name)) }))
  const sha512 = createHash('sha512').update(assets[0].bytes).digest('base64')
  if (
    metadata.sha512 !== sha512 ||
    metadata.files[0].sha512 !== sha512 ||
    metadata.files[0].size !== assets[0].bytes.length
  )
    throw new Error('Metadata digest or size mismatch')
  if (!assets[1].bytes.length) throw new Error('Empty blockmap')
  return { version, assets }
}
