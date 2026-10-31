import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { githubClient } from './github.mjs'

export function parseTag(tag) {
  if (typeof tag !== 'string' || !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag))
    return null
  const parts = tag.slice(1).split('.').map(Number)
  if (!parts.every(Number.isSafeInteger)) throw new Error('Version exceeds safe integer range')
  return parts
}
export async function publishedReleases(api) {
  const releases = []
  for (let page = 1; page <= 10000; page++) {
    const batch = await api('/releases?per_page=100&page=' + page)
    if (!Array.isArray(batch)) throw new Error('Incomplete release discovery')
    releases.push(...batch.filter((r) => !r.draft))
    if (batch.length < 100) return releases
  }
  throw new Error('Incomplete release discovery')
}
export function nextVersion(releases) {
  const versions = releases
    .filter((r) => !r.draft)
    .map((r) => parseTag(r.tag_name))
    .filter(Boolean)
  versions.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
  if (!versions.length) return '0.1.1'
  const [major, minor, patch] = versions.at(-1)
  if (!Number.isSafeInteger(patch + 1)) throw new Error('Version exceeds safe integer range')
  return [major, minor, patch + 1].join('.')
}
export function stamp(version, root = '.') {
  if (!parseTag('v' + version)) throw new Error('Invalid version')
  for (const file of ['package.json', 'package-lock.json']) {
    const target = root + '/' + file
    const json = JSON.parse(readFileSync(target, 'utf8'))
    json.version = version
    if (file === 'package-lock.json') json.packages[''].version = version
    writeFileSync(target, JSON.stringify(json, null, 2) + '\n')
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--stamp') stamp(process.argv[3])
  else {
    const version = nextVersion(await publishedReleases(githubClient()))
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, 'version=' + version + '\n')
    console.log(version)
  }
}
