import { pathToFileURL } from 'node:url'
import { inventory } from './assets.mjs'
import { publishedReleases } from './version.mjs'
import { githubClient } from './github.mjs'

export async function publish(candidate, sha, api, upload) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid source SHA')
  const tag = 'v' + candidate.version
  const releases = await publishedReleases(api)
  if (
    releases.some((r) => r.tag_name === tag) ||
    (await api('/releases/tags/' + tag, { allow404: true })) ||
    (await api('/git/ref/tags/' + tag, { allow404: true }))
  )
    throw new Error('Tag/release already exists')
  // Drafts are included separately: GitHub may not return a draft by tag.
  for (let page = 1; ; page++) {
    const batch = await api('/releases?per_page=100&page=' + page)
    if (!Array.isArray(batch)) throw new Error('Incomplete release discovery')
    if (batch.some((r) => r.tag_name === tag)) throw new Error('Tag/release already exists')
    if (batch.length < 100) break
    if (page >= 10000) throw new Error('Incomplete release discovery')
  }
  const draft = await api('/releases', {
    method: 'POST',
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: sha,
      name: tag,
      draft: true,
      prerelease: false,
    }),
  })
  try {
    for (const asset of candidate.assets) await upload(draft, asset)
  } catch (error) {
    // Only this attempt's known, still-unpublished draft is eligible for cleanup.
    try {
      const current = await api('/releases/' + draft.id)
      if (
        current?.id === draft.id &&
        current.draft === true &&
        current.tag_name === tag &&
        current.target_commitish === sha
      ) {
        await api('/releases/' + draft.id, { method: 'DELETE' })
      }
    } catch {
      /* Preserve the original failure; owner can inspect an orphaned draft. */
    }
    throw error
  }
  // A failed final response is ambiguous: never clean up after this request.
  return api('/releases/' + draft.id, {
    method: 'PATCH',
    body: JSON.stringify({ draft: false, prerelease: false, make_latest: 'true' }),
  })
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const candidate = inventory(process.argv[2] ?? 'candidate', process.env.RELEASE_VERSION)
  await publish(candidate, process.env.SOURCE_SHA, githubClient(), async (draft, asset) => {
    const url = new URL(draft.upload_url.split('{')[0])
    if (url.origin !== 'https://uploads.github.com') throw new Error('Unexpected upload host')
    url.searchParams.set('name', asset.name)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.GH_TOKEN,
        'Content-Type': 'application/octet-stream',
      },
      body: asset.bytes,
    })
    if (!response.ok) throw new Error('Asset upload failed: ' + response.status)
  })
}
