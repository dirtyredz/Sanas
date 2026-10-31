import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import asar from '@electron/asar'
import yaml from 'js-yaml'
import { inventory } from './assets.mjs'

export function checkPackage(folder = 'release') {
  const config = yaml.load(readFileSync('electron-builder.yml', 'utf8'))
  if (config.win.verifyUpdateCodeSignature !== false)
    throw new Error('Unsigned update policy missing')
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version
  inventory(folder, version)
  const resources = join(folder, 'win-unpacked', 'resources')
  const archive = join(resources, 'app.asar')
  const pkg = JSON.parse(asar.extractFile(archive, 'package.json').toString())
  if (
    pkg.version !== version ||
    !pkg.dependencies['better-sqlite3'] ||
    !pkg.dependencies['electron-updater']
  )
    throw new Error('Packaged dependencies/version mismatch')
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    )
  const bindings = walk(join(resources, 'app.asar.unpacked')).filter((p) =>
    p.endsWith('better_sqlite3.node'),
  )
  if (bindings.length !== 1 || !bindings[0].includes('better-sqlite3'))
    throw new Error('Unpacked SQLite binding missing or ambiguous')
  const update = yaml.load(readFileSync(join(resources, 'app-update.yml'), 'utf8'))
  if (
    update.provider !== 'github' ||
    update.owner !== 'dirtyredz' ||
    update.repo !== 'Sanas' ||
    update.publisherName != null
  )
    throw new Error('Updater configuration mismatch')
  console.log(
    'Package OK: ' + version + ', unpacked native binding and public unsigned updater metadata',
  )
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  checkPackage(process.argv[2])
