import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import yaml from 'js-yaml'

// The one definition of the GitHub repo that releases are published to and installed from:
// electron-builder.yml's `publish` block. Release scripts read it here instead of hardcoding it.
const configPath = fileURLToPath(new URL('../../../electron-builder.yml', import.meta.url))

export function releaseRepo(path = configPath) {
  const publish = yaml.load(readFileSync(path, 'utf8')).publish
  if (publish?.provider !== 'github' || !publish.owner || !publish.repo)
    throw new Error('electron-builder.yml publish must name a github owner and repo')
  return { owner: publish.owner, repo: publish.repo, slug: publish.owner + '/' + publish.repo }
}

// `node repo.mjs` prints owner/repo for the PowerShell owner scripts.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  console.log(releaseRepo().slug)
