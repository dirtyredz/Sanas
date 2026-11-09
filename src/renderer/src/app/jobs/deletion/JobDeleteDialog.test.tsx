import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { JobDeletionCounts, JobDeletionPreview } from '@shared/jobs/deletion'
import { JobDeleteDialog } from './JobDeleteDialog'

// DOM-free: hooks become plain slots and the effects are run by hand.
const hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  setters: [] as ((next: unknown) => void)[],
  cursor: 0,
  effectCursor: 0,
  deps: [] as (unknown[] | undefined)[],
  queued: [] as { idx: number; run: () => unknown }[],
  cleanups: [] as unknown[],
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.values)) hooks.values[slot] = initial
    // A stable setter per slot, like React's.
    hooks.setters[slot] ??= (next: unknown) => {
      hooks.values[slot] = typeof next === 'function' ? next(hooks.values[slot]) : next
    }
    return [hooks.values[slot], hooks.setters[slot]]
  },
  useEffect: (run: () => unknown, deps?: unknown[]) => {
    const idx = hooks.effectCursor++
    const prev = hooks.deps[idx]
    if (!deps || !prev || deps.some((d, i) => !Object.is(d, prev[i]))) {
      hooks.deps[idx] = deps
      hooks.queued.push({ idx, run })
    }
  },
}))

/** Run the effects whose dependencies changed, as React would after a commit. */
function runEffects(): void {
  const queued = hooks.queued
  hooks.queued = []
  for (const { idx, run } of queued) {
    ;(hooks.cleanups[idx] as (() => void) | undefined)?.()
    hooks.cleanups[idx] = run()
  }
}
function resetHooks(): void {
  hooks.values = []
  hooks.setters = []
  hooks.deps = []
  hooks.queued = []
  hooks.cleanups = []
  hooks.cursor = 0
  hooks.effectCursor = 0
}
const flush = (): Promise<void> => new Promise((done) => setTimeout(done, 0))
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

type Props = {
  children?: ReactNode
  role?: string
  className?: string
  disabled?: boolean
  autoFocus?: boolean
  onClick: () => void
  onKeyDown: (e: { key: string }) => void
}
function nodes(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (!isValidElement<Props>(node)) return []
  return [node, ...nodes(node.props.children)]
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('')
  if (isValidElement<Props>(node)) return text(node.props.children)
  return typeof node === 'string' || typeof node === 'number' ? String(node) : ''
}

const onClose = vi.fn()
const onDeleted = vi.fn()
function render() {
  hooks.cursor = 0
  hooks.effectCursor = 0
  const root = JobDeleteDialog({ jobId: 9, onClose, onDeleted }) as ReactElement<Props>
  const all = nodes(root)
  const buttons = all.filter((n) => n.type === 'button')
  const list = all.find((n) => n.props.className === 'confirm-counts')
  return {
    root,
    buttons,
    cancel: buttons[0],
    del: buttons[1],
    lines: list ? nodes(list.props.children).map((li) => text(li)) : undefined,
    status: all.find((n) => n.props.role === 'status'),
    warns: all.filter((n) => n.props.className === 'notice warn').map((n) => text(n)),
  }
}

const counts: JobDeletionCounts = {
  meetings: 3,
  practiceSessions: 2,
  transcriptSegments: 0,
  summaries: 0,
  suggestions: 0,
  recordings: 4,
  glossaryTerms: 5,
  resumes: 1,
  applicationLinks: 1,
  memories: 0,
  memoryProposals: 0,
  legacySlides: 0,
}
const okPreview: JobDeletionPreview = {
  jobId: 9,
  jobName: 'Acme',
  counts,
  blocked: null,
  token: 'tok-1',
}
const api = { deletePreview: vi.fn(), delete: vi.fn() }

beforeEach(() => {
  resetHooks()
  onClose.mockReset()
  onDeleted.mockReset()
  for (const fn of Object.values(api)) fn.mockReset()
  api.deletePreview.mockResolvedValue(okPreview)
  vi.stubGlobal('window', { sanas: { jobs: api } })
})
afterEach(() => vi.unstubAllGlobals())

async function loaded() {
  render()
  runEffects()
  await flush()
  return render()
}

it('shows the exact counted lines and the recordings warning once the preview resolves', async () => {
  render()
  runEffects()
  expect(render().del.props.disabled).toBe(true) // still loading
  await flush()
  const page = render()
  expect(api.deletePreview).toHaveBeenCalledWith(9)
  expect(page.lines).toEqual([
    '3 meetings',
    '2 practice sessions',
    '4 audio recordings',
    '5 glossary terms',
    'the saved resume',
    'the resumes application link',
  ])
  expect(page.warns.join(' ')).toContain(
    'Recordings are not included in the database backup. Once deleted they cannot be recovered.',
  )
  expect(page.del.props.disabled).toBe(false)
})

it('makes Cancel the first, auto-focused button', async () => {
  const page = await loaded()
  expect(page.buttons[0].props.children).toBe('Cancel')
  expect(page.cancel.props.autoFocus).toBe(true)
  expect(page.del.props.autoFocus).toBeUndefined()
})

it('blocks deletion with the reason and no token', async () => {
  api.deletePreview.mockResolvedValue({
    ...okPreview,
    token: null,
    blocked: { reason: 'live-meeting', message: 'A meeting is live.' },
  })
  const page = await loaded()
  expect(page.warns).toEqual(['A meeting is live.'])
  expect(page.lines).toBeUndefined()
  expect(page.del.props.disabled).toBe(true)
  page.del.props.onClick()
  expect(api.delete).not.toHaveBeenCalled()
})

it('deletes once with the token and ignores a second click while pending', async () => {
  const pendingDelete = deferred<unknown>()
  api.delete.mockReturnValue(pendingDelete.promise)
  const page = await loaded()
  page.del.props.onClick()
  const during = render()
  expect(during.del.props.disabled).toBe(true)
  expect(during.cancel.props.disabled).toBe(true)
  during.del.props.onClick()
  expect(api.delete).toHaveBeenCalledTimes(1)
  expect(api.delete).toHaveBeenCalledWith('tok-1')
  pendingDelete.resolve({ status: 'deleted', backup: { fileName: 'b.db' }, removed: counts })
  await flush()
  expect(onDeleted).toHaveBeenCalledOnce()
  expect(api.delete).toHaveBeenCalledTimes(1)
})

for (const result of [
  {
    status: 'partial',
    message: 'One meeting stayed.',
    backup: { fileName: 'b.db' },
    removed: { meetings: 1, practiceSessions: 0, recordings: 0 },
  },
  { status: 'backup-failed', message: 'Backup failed.' },
  { status: 'stale', message: 'Changed since preview.' },
]) {
  it(`stays open, explains and re-counts after a '${result.status}' result`, async () => {
    api.delete.mockResolvedValue(result)
    const page = await loaded()
    page.del.props.onClick()
    await flush()
    const after = render()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(after.status && text(after.status)).toContain(result.message)
    expect(after.cancel.props.disabled).toBe(false)
    runEffects() // the version bump re-runs the preview effect
    expect(api.deletePreview).toHaveBeenCalledTimes(2)
  })
}

it('closes on Escape', async () => {
  const page = await loaded()
  page.root.props.onKeyDown({ key: 'Enter' })
  expect(onClose).not.toHaveBeenCalled()
  page.root.props.onKeyDown({ key: 'Escape' })
  expect(onClose).toHaveBeenCalledOnce()
})
