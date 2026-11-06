import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { ApplicationPreview as Preview, PreviewField } from '@shared/jobs/applications'
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

type Props = {
  children?: ReactNode
  role?: string
  type?: string
  name?: string
  className?: string
  disabled?: boolean
  checked?: boolean
  value?: string
  maxLength?: number
  'aria-label'?: string
  onClick: () => void
  onChange: (e?: { target: { value?: string; checked?: boolean } }) => void
}
/** Walks the tree, expanding plain function components (the field view has no hooks). */
function nodes(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (!isValidElement<Props>(node)) return []
  if (typeof node.type === 'function')
    return nodes((node.type as (p: unknown) => ReactNode)(node.props))
  return [node, ...nodes(node.props.children)]
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('')
  if (isValidElement<Props>(node)) return text(node.props.children)
  return typeof node === 'string' || typeof node === 'number' ? String(node) : ''
}

const onCancel = vi.fn()
const onApplied = vi.fn()
function render() {
  hooks.cursor = 0
  hooks.effectCursor = 0
  const all = nodes(ApplicationPreview({ applicationId: 'app-1', onCancel, onApplied }))
  const byText = (type: string, label: string) =>
    all.find((n) => n.type === type && text(n.props.children).trim() === label)
  return {
    all,
    nameInput: all.find((n) => n.type === 'input' && n.props.maxLength === 120),
    checkboxes: all.filter((n) => n.props.type === 'checkbox'),
    radios: (name: string) => all.filter((n) => n.props.type === 'radio' && n.props.name === name),
    textarea: (label: string) =>
      all.find((n) => n.type === 'textarea' && n.props['aria-label'] === label),
    badges: all.filter((n) => String(n.props.className).startsWith('badge ')).map((n) => text(n)),
    primary: all.find((n) => n.props.className === 'btn btn-primary')!,
    review: byText('button', 'Review again'),
    status: all.find((n) => n.props.role === 'status'),
    hints: all.filter((n) => n.props.className === 'hint').map((n) => text(n)),
  }
}

function field(over: Partial<PreviewField>): PreviewField {
  return {
    key: 'notes',
    label: 'Notes',
    outcome: 'new',
    local: null,
    incoming: '',
    source: 'resumes',
    editable: false,
    draftError: null,
    ...over,
  }
}
function preview(over: Partial<Preview>): Preview {
  return {
    token: 'tok',
    mode: 'create',
    applicationId: 'app-1',
    jobId: null,
    company: 'Acme',
    role: 'Engineer',
    stage: 'interview',
    jdUrl: '',
    updatedAt: null,
    name: { proposed: 'Acme - Engineer', shortened: false },
    fields: [],
    glossaryExcluded: [],
    normalized: [],
    stageChange: null,
    offerArchive: false,
    archived: false,
    hasChanges: true,
    draftNotice: null,
    ...over,
  }
}
const createPreview = preview({
  fields: [
    field({
      key: 'companyInfo',
      label: 'Company info',
      incoming: 'Drafted info',
      source: 'drafted',
      editable: true,
    }),
    field({ key: 'projectScope', label: 'Project scope', incoming: 'Scope from pack' }),
  ],
})
const refreshConflict = preview({
  mode: 'refresh',
  jobId: 4,
  name: null,
  fields: [
    field({
      key: 'notes',
      label: 'Notes',
      outcome: 'conflict',
      local: 'mine',
      incoming: 'theirs',
    }),
  ],
})

const api = { preview: vi.fn(), apply: vi.fn() }
beforeEach(() => {
  resetHooks()
  onCancel.mockReset()
  onApplied.mockReset()
  for (const fn of Object.values(api)) fn.mockReset()
  api.preview.mockResolvedValue(createPreview)
  vi.stubGlobal('window', { sanas: { jobApplications: api } })
})
afterEach(() => vi.unstubAllGlobals())

async function loaded() {
  render()
  runEffects()
  await flush()
  return render()
}

it('create preview proposes the name and labels drafted vs resumes fields', async () => {
  const page = await loaded()
  expect(api.preview).toHaveBeenCalledWith('app-1')
  expect(page.nameInput!.props.value).toBe('Acme - Engineer')
  expect(page.textarea('Company info')!.props.value).toBe('Drafted info')
  expect(page.textarea('Project scope')).toBeUndefined()
  expect(page.badges).toEqual(['Drafted by Sanas', 'From resumes'])
  expect(page.primary.props.children).toBe('Create job')
})

it('blocks Create on a shortened proposal until it is accepted', async () => {
  api.preview.mockResolvedValue(
    preview({ name: { proposed: 'Acme - Very long…', shortened: true } }),
  )
  let page = await loaded()
  expect(page.primary.props.disabled).toBe(true)
  expect(page.hints).toContain('The proposed name was shortened. Accept or edit it.')
  page.checkboxes[0].props.onChange({ target: { checked: true } })
  page = render()
  expect(page.primary.props.disabled).toBe(false)
  expect(page.hints).not.toContain('The proposed name was shortened. Accept or edit it.')
})

it('sends edits to drafted fields and the trimmed name, then reports the new job', async () => {
  api.apply.mockResolvedValue({ status: 'created', jobId: 7 })
  let page = await loaded()
  page.textarea('Company info')!.props.onChange({ target: { value: 'My edit' } })
  page = render() // each handler closes over its render's choices, as in React
  page.nameInput!.props.onChange({ target: { value: '  Renamed  ' } })
  page = render()
  expect(page.textarea('Company info')!.props.value).toBe('My edit')
  page.primary.props.onClick()
  await flush()
  expect(api.apply).toHaveBeenCalledWith({
    token: 'tok',
    name: 'Renamed',
    edits: { companyInfo: 'My edit' },
  })
  expect(onApplied).toHaveBeenCalledWith(7)
})

it('sends no edits when nothing was edited', async () => {
  api.apply.mockResolvedValue({ status: 'created', jobId: 7 })
  const page = await loaded()
  page.primary.props.onClick()
  await flush()
  expect(api.apply).toHaveBeenCalledWith({ token: 'tok', name: 'Acme - Engineer' })
})

it('defaults conflicts to Keep Sanas and sends an incoming choice only when chosen', async () => {
  api.preview.mockResolvedValue(refreshConflict)
  api.apply.mockResolvedValue({ status: 'updated', jobId: 4, archived: false })
  let page = await loaded()
  let [keep, use] = page.radios('choice-notes')
  expect([keep.props.checked, use.props.checked]).toEqual([true, false])
  expect(page.primary.props.children).toBe('Apply')
  use.props.onChange()
  page = render()
  ;[keep, use] = page.radios('choice-notes')
  expect([keep.props.checked, use.props.checked]).toEqual([false, true])
  page.primary.props.onClick()
  await flush()
  expect(api.apply).toHaveBeenCalledWith({ token: 'tok', choices: { notes: 'incoming' } })
  expect(onApplied).toHaveBeenCalledWith(4)
})

it('applies a refresh with no choices as just the token', async () => {
  api.preview.mockResolvedValue(refreshConflict)
  api.apply.mockResolvedValue({ status: 'updated', jobId: 4, archived: false })
  const page = await loaded()
  page.primary.props.onClick()
  await flush()
  expect(api.apply).toHaveBeenCalledWith({ token: 'tok' })
})

it('offers archiving unchecked by default and sends archive only as chosen', async () => {
  api.preview.mockResolvedValue(
    preview({ mode: 'refresh', jobId: 4, name: null, offerArchive: true }),
  )
  api.apply.mockResolvedValue({ status: 'updated', jobId: 4, archived: true })
  let page = await loaded()
  expect(page.checkboxes).toHaveLength(1)
  expect(page.checkboxes[0].props.checked).toBe(false)
  page.primary.props.onClick()
  await flush()
  expect(api.apply).toHaveBeenLastCalledWith({ token: 'tok', archive: false })

  page = render()
  page.checkboxes[0].props.onChange({ target: { checked: true } })
  page = render()
  expect(page.checkboxes[0].props.checked).toBe(true)
  page.primary.props.onClick()
  await flush()
  expect(api.apply).toHaveBeenLastCalledWith({ token: 'tok', archive: true })
})

it('on a stale result shows the message, then Review again re-previews and keeps applicable choices', async () => {
  const stillConflict = refreshConflict
  const first = preview({
    mode: 'refresh',
    jobId: 4,
    name: null,
    fields: [
      ...refreshConflict.fields,
      field({ key: 'persona', label: 'Persona', outcome: 'conflict', local: 'a', incoming: 'b' }),
    ],
  })
  const second = preview({
    ...stillConflict,
    token: 'tok-2',
    fields: [
      ...stillConflict.fields,
      field({ key: 'persona', label: 'Persona', outcome: 'unchanged' }),
    ],
  })
  api.preview.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
  api.apply
    .mockResolvedValueOnce({ status: 'stale', message: 'Changed since preview—review again.' })
    .mockResolvedValueOnce({ status: 'updated', jobId: 4, archived: false })

  let page = await loaded()
  page.radios('choice-notes')[1].props.onChange()
  page = render()
  page.radios('choice-persona')[1].props.onChange()
  page = render()
  page.primary.props.onClick()
  await flush()

  page = render()
  expect(onApplied).not.toHaveBeenCalled()
  expect(text(page.status!.props.children)).toContain('Changed since preview—review again.')
  expect(page.primary.props.disabled).toBe(true)

  page.review!.props.onClick()
  render()
  runEffects()
  await flush()
  expect(api.preview).toHaveBeenCalledTimes(2)
  page = render()
  expect(page.status).toBeUndefined()
  expect(page.radios('choice-notes')[1].props.checked).toBe(true) // retained
  page.primary.props.onClick()
  await flush()
  // persona is no longer a conflict, so its stale choice is dropped
  expect(api.apply).toHaveBeenLastCalledWith({ token: 'tok-2', choices: { notes: 'incoming' } })
  expect(onApplied).toHaveBeenCalledWith(4)
})
