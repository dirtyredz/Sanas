import { expect, it, vi } from 'vitest'
import { publish } from './publish.mjs'
const candidate = {
  version: '0.1.1',
  assets: [{ name: 'installer' }, { name: 'blockmap' }, { name: 'latest.yml' }],
}
const sha = 'a'.repeat(40)
function client(collision = false) {
  return vi.fn(async (route, options = {}) => {
    if (route.includes('?')) return []
    if (options.method === 'POST' || route === '/releases/10')
      return { id: 10, draft: true, tag_name: 'v0.1.1', target_commitish: sha }
    if (options.method === 'PATCH') return { draft: false }
    return collision ? { id: 20 } : null
  })
}
it('publishes only after every upload succeeds', async () => {
  const api = client()
  const upload = vi.fn(async () => {
    expect(api.mock.calls.some(([, o]) => o?.method === 'PATCH')).toBe(false)
  })
  await publish(candidate, sha, api, upload)
  expect(upload).toHaveBeenCalledTimes(3)
  expect(api.mock.calls.at(-1)?.[1]?.method).toBe('PATCH')
})
it('refuses collisions before mutation', async () => {
  const api = client(true)
  const upload = vi.fn()
  await expect(publish(candidate, sha, api, upload)).rejects.toThrow('already exists')
  expect(upload).not.toHaveBeenCalled()
  expect(api.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false)
})
it('failed upload removes only this attempt draft and never publishes', async () => {
  const api = client()
  await expect(
    publish(candidate, sha, api, async () => {
      throw new Error('upload failed')
    }),
  ).rejects.toThrow('upload failed')
  expect(api.mock.calls.some(([, o]) => o?.method === 'PATCH')).toBe(false)
  expect(api.mock.calls.at(-1)?.[1]?.method).toBe('DELETE')
})

it('never deletes a draft that became public during an upload failure', async () => {
  const original = client()
  const api = vi.fn((route, options) =>
    route === '/releases/10' && !options?.method
      ? Promise.resolve({ id: 10, draft: false, tag_name: 'v0.1.1', target_commitish: sha })
      : original(route, options),
  )
  await expect(
    publish(candidate, sha, api, async () => {
      throw new Error('upload failed')
    }),
  ).rejects.toThrow('upload failed')
  expect(api.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(false)
})
it('leaves ambiguous publication responses for owner inspection without cleanup', async () => {
  const original = client()
  const api = vi.fn((route, options) =>
    options?.method === 'PATCH'
      ? Promise.reject(new Error('lost publish response'))
      : original(route, options),
  )
  await expect(publish(candidate, sha, api, async () => {})).rejects.toThrow(
    'lost publish response',
  )
  expect(api.mock.calls.at(-1)?.[1]?.method).toBe('PATCH')
  expect(api.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(false)
})
