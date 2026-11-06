import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { ApplicationListing, ApplicationSummary } from '@shared/jobs/applications'
import { ApplicationPicker } from './ApplicationPicker'
import { ApplicationPreview } from './ApplicationPreview'

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
  useRef: (initial: unknown) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.values)) hooks.values[slot] = { current: initial }
    return hooks.values[slot]
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
  className?: string
  disabled?: boolean
  applicationId?: string
  onClick: () => void
}
// ApplicationPreview is a hooked child, so it is left unexpanded and inspected by its props.
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

const onCancel = vi.fn()
const onOpenJob = vi.fn()
const onApplied = vi.fn()
function render() {
  hooks.cursor = 0
  hooks.effectCursor = 0
  const all = nodes(ApplicationPicker({ onCancel, onOpenJob, onApplied }))
  const button = (label: string) =>
    all.find((n) => n.type === 'button' && text(n.props.children) === label)
  const row = (id: string) => {
    const li = all.find((n) => n.type === 'li' && n.key === id)
    return li
      ? { text: text(li), buttons: nodes(li.props.children).filter((n) => n.type === 'button') }
      : null
  }
  return {
    all,
    button,
    row,
    preview: all.find((n) => n.type === ApplicationPreview),
    notices: all.filter((n) => n.props.className === 'notice warn').map((n) => text(n)),
    empty: all.find((n) => n.props.className === 'empty'),
  }
}

function summary(over: Partial<ApplicationSummary>): ApplicationSummary {
  return {
    applicationId: 'app',
    company: 'Acme',
    role: 'Engineer',
    stage: 'interview',
    updatedAt: null,
    status: 'new',
    jobId: null,
    jobName: null,
    archived: false,
    error: null,
    retryable: false,
    ...over,
  }
}
function listing(over: Partial<ApplicationListing>): ApplicationListing {
  return {
    sourceRoot: 'C:\\resumes',
    refresh: { ok: true },
    folder: 'ok',
    folderError: null,
    packs: [],
    limited: false,
    ...over,
  }
}

const api = { list: vi.fn() }
beforeEach(() => {
  resetHooks()
  onCancel.mockReset()
  onOpenJob.mockReset()
  onApplied.mockReset()
  api.list.mockReset()
  vi.stubGlobal('window', { sanas: { jobApplications: api } })
})
afterEach(() => vi.unstubAllGlobals())

async function mounted() {
  render()
  runEffects()
  await flush()
  return render()
}

it('lists once on mount', async () => {
  api.list.mockResolvedValue(listing({}))
  await mounted()
  render()
  runEffects() // later renders do not re-run the mount effect
  expect(api.list).toHaveBeenCalledTimes(1)
})

it('keeps the pack rows under a failed-refresh warning with Retry, disabled while refreshing', async () => {
  api.list.mockResolvedValue(
    listing({
      refresh: { ok: false, message: 'command exited 2' },
      packs: [
        summary({ applicationId: 'a1' }),
        summary({ applicationId: 'a2', company: 'Globex' }),
      ],
    }),
  )
  render()
  runEffects()
  const during = render()
  expect(during.button('Refreshing…')!.props.disabled).toBe(true)
  await flush()
  const page = render()
  expect(page.notices[0]).toContain('Couldn’t refresh from resumes: command exited 2')
  expect(page.button('Retry')).toBeDefined()
  expect(page.button('Retry')!.props.disabled).toBe(false)
  expect(page.row('a1')).not.toBeNull()
  expect(page.row('a2')!.text).toContain('Globex')

  api.list.mockReturnValue(new Promise(() => {}))
  page.button('Retry')!.props.onClick()
  expect(render().button('Retry')!.props.disabled).toBe(true)
})

it('ignores a stale reply that arrives after a newer refresh resolved', async () => {
  const first = deferred<ApplicationListing>()
  const second = deferred<ApplicationListing>()
  api.list.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  render()
  runEffects()
  render().button('Refreshing…')!.props.onClick() // newer request
  second.resolve(listing({ packs: [summary({ applicationId: 'newer' })] }))
  await flush()
  first.resolve(listing({ packs: [summary({ applicationId: 'older' })] }))
  await flush()
  const page = render()
  expect(page.row('newer')).not.toBeNull()
  expect(page.row('older')).toBeNull()
  expect(page.button('Refresh')!.props.disabled).toBe(false)
})

it("opens the job for an 'imported' row", async () => {
  api.list.mockResolvedValue(
    listing({ packs: [summary({ applicationId: 'done', status: 'imported', jobId: 12 })] }),
  )
  const page = await mounted()
  const [open] = page.row('done')!.buttons
  expect(text(open.props.children)).toBe('Open job')
  open.props.onClick()
  expect(onOpenJob).toHaveBeenCalledWith(12)
})

it("switches to the preview for a 'new' row and back on Cancel", async () => {
  api.list.mockResolvedValue(listing({ packs: [summary({ applicationId: 'fresh' })] }))
  const page = await mounted()
  const [create] = page.row('fresh')!.buttons
  expect(text(create.props.children)).toBe('Preview and create')
  create.props.onClick()
  const next = render()
  expect(next.preview!.props.applicationId).toBe('fresh')
  expect(next.row('fresh')).toBeNull()
  ;(next.preview!.props as unknown as { onCancel: () => void }).onCancel()
  expect(render().row('fresh')).not.toBeNull()
})

it('shows an invalid pack with its error and no action', async () => {
  api.list.mockResolvedValue(
    listing({
      packs: [summary({ applicationId: 'bad', status: 'invalid', error: 'Missing company.' })],
    }),
  )
  const row = (await mounted()).row('bad')!
  expect(row.text).toContain('Missing company.')
  expect(row.buttons).toHaveLength(0)
})

it('explains an empty listing with the source root', async () => {
  api.list.mockResolvedValue(listing({ sourceRoot: 'D:\\my-resumes' }))
  const page = await mounted()
  expect(text(page.empty!.props.children)).toContain('No interview packs yet')
  expect(text(page.empty!.props.children)).toContain('D:\\my-resumes')
})
