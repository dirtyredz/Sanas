import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { JobResume } from './JobResume'
import { ResumeDraftEditor } from './ResumeDraftEditor'

// Exercise the save/import lifecycle without a DOM: hooks become plain slots and the load
// effect is run by hand.
const hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  effects: [] as (() => unknown)[],
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: (effect: () => unknown) => {
    hooks.effects.push(effect)
  },
  useState: (initial: unknown) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.values)) hooks.values[slot] = initial
    return [
      hooks.values[slot],
      (next: unknown) => {
        hooks.values[slot] = typeof next === 'function' ? next(hooks.values[slot]) : next
      },
    ]
  },
}))

type Props = {
  children?: ReactNode
  role?: string
  disabled?: boolean
  onClick: () => void
  onChange: (value: unknown) => void
  onImport: () => void
  value: unknown
}
function nodes(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (!isValidElement<Props>(node)) return []
  return [node, ...nodes(node.props.children)]
}
function render() {
  hooks.cursor = 0
  hooks.effects = []
  const all = nodes(JobResume({ jobId: 4 }))
  const editor = all.find((n) => n.type === ResumeDraftEditor)!.props
  const save = all.find((n) => n.type === 'button' && n.props.children !== undefined)!
  const status = all.find((n) => n.props.role === 'status')!.props.children
  return { all, editor, save, status, effects: hooks.effects }
}
const flush = (): Promise<void> => new Promise((done) => setTimeout(done, 0))
const savedResume = { name: 'Platform CV', text: 'At ExampleCo I led a Camunda migration.' }
const api = {
  getResume: vi.fn(),
  setResume: vi.fn(),
  importResume: vi.fn(),
}
beforeEach(() => {
  hooks.values = []
  for (const fn of Object.values(api)) fn.mockReset()
  api.getResume.mockResolvedValue(savedResume)
  vi.stubGlobal('window', { sanas: { jobs: api } })
})
afterEach(() => vi.unstubAllGlobals())

async function loaded() {
  render().effects[0]()
  await flush()
  return render()
}

it('loads the saved resume and enables Save resume only after a change', async () => {
  const page = await loaded()
  expect(api.getResume).toHaveBeenCalledWith(4)
  expect(page.editor.value).toEqual(savedResume)
  expect(page.save.props.disabled).toBe(true)
  page.editor.onChange({ ...savedResume, text: 'Replaced text' })
  expect(render().save.props.disabled).toBe(false)
})

it('saves a replacement, then reloads what main stored', async () => {
  api.setResume.mockImplementation(async (_id, resume) => resume)
  let page = await loaded()
  page.editor.onChange({ name: 'New CV', text: 'Java and Kotlin' })
  render().save.props.onClick()
  await flush()
  expect(api.setResume).toHaveBeenCalledWith(4, { name: 'New CV', text: 'Java and Kotlin' })
  page = render()
  expect(page.editor.value).toEqual({ name: 'New CV', text: 'Java and Kotlin' })
  expect(page.save.props.disabled).toBe(true)
  expect(page.status).toContain('New meetings for this job will use it')
})

it('removal is a draft change committed by Save resume', async () => {
  api.setResume.mockResolvedValue(null)
  const page = await loaded()
  page.editor.onChange(null)
  expect(api.setResume).not.toHaveBeenCalled()
  render().save.props.onClick()
  await flush()
  expect(api.setResume).toHaveBeenCalledWith(4, null)
  expect(render().status).toContain('Resume removed')
})

it('keeps the draft when saving fails', async () => {
  api.setResume.mockRejectedValue(new Error('Job not found.'))
  const page = await loaded()
  page.editor.onChange({ name: 'Draft', text: 'Unsaved facts' })
  render().save.props.onClick()
  await flush()
  const after = render()
  expect(after.editor.value).toEqual({ name: 'Draft', text: 'Unsaved facts' })
  expect(after.status).toContain('Job not found.')
  expect(after.save.props.disabled).toBe(false)
})

it('imports into the draft without saving; cancel and failure keep the draft', async () => {
  const page = await loaded()
  page.editor.onChange({ name: 'Draft', text: 'Typed facts' })
  api.importResume.mockResolvedValueOnce(null)
  render().editor.onImport()
  await flush()
  expect(render().editor.value).toEqual({ name: 'Draft', text: 'Typed facts' })
  api.importResume.mockRejectedValueOnce(new Error('No text found — paste the text instead.'))
  render().editor.onImport()
  await flush()
  let after = render()
  expect(after.editor.value).toEqual({ name: 'Draft', text: 'Typed facts' })
  expect(after.editor).toMatchObject({ importError: 'No text found — paste the text instead.' })
  api.importResume.mockResolvedValueOnce({ name: 'Resume.pdf', text: 'Imported facts' })
  render().editor.onImport()
  await flush()
  after = render()
  expect(after.editor.value).toEqual({ name: 'Resume.pdf', text: 'Imported facts' })
  expect(api.setResume).not.toHaveBeenCalled()
})

it('ignores a load that resolves after the job changed', async () => {
  let resolve!: (value: unknown) => void
  api.getResume.mockReturnValue(new Promise((done) => (resolve = done)))
  const cleanup = render().effects[0]() as () => void
  cleanup()
  resolve(savedResume)
  await flush()
  expect(render().editor.value).toBeNull()
})
