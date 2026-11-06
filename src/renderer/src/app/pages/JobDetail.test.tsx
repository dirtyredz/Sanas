import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { Job } from '@shared/types'
import { jobs } from '../../dev/mock-fixtures'
import { JobTabs } from '../jobs/JobTabs'
import { JobDetail } from './JobDetail'
import { JobOverview } from '../jobs/JobOverview'
import { JobEmail } from '../jobs/JobEmail'
import { JobResume } from '../jobs/JobResume'
import { JobDeleteDialog } from '../jobs/deletion/JobDeleteDialog'
import { ApplicationPreview } from '../jobs/applications/ApplicationPreview'

// Exercise page callbacks and successive renders without adding a DOM dependency.
// Child identity assertions cover the mounted editor boundary.
const hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  setters: [] as ((next: unknown) => void)[],
  cursor: 0,
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: () => {},
  useState: (initial: unknown) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.values)) hooks.values[slot] = initial
    // A stable setter per slot, like React's (JobResume receives one as a prop).
    hooks.setters[slot] ??= (next: unknown) => {
      hooks.values[slot] = typeof next === 'function' ? next(hooks.values[slot]) : next
    }
    return [hooks.values[slot], hooks.setters[slot]]
  },
}))
vi.mock('./MeetingView', () => ({ MeetingView: () => null }))

type Props = {
  children?: ReactNode
  role?: string
  hidden?: boolean
  'aria-selected'?: boolean
  onClick: () => void | Promise<void>
  onKeyDown: (event: { key: string; preventDefault: () => void }) => void
  job: Job
  setJob: (job: Job) => void
}

function nodes(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (!isValidElement<Props>(node)) return []
  if (node.type === JobTabs)
    return nodes(JobTabs(node.props as unknown as Parameters<typeof JobTabs>[0]))
  return [node, ...nodes(node.props.children)]
}

function render() {
  hooks.cursor = 0
  const all = nodes(JobDetail({ jobId: 1, onBack: () => {} }))
  return {
    all,
    tab: (name: string) => all.find((n) => n.props.role === 'tab' && n.props.children === name)!,
    child: (type: unknown) => all.find((n) => n.type === type)!,
    save: () =>
      all.find((n) => n.type === 'button' && n.props.children === 'Save')!.props.onClick(),
  }
}

const update = vi.fn(async (job: Partial<Job>) => ({ ...jobs[0], ...job }))
beforeEach(() => {
  hooks.values = [{ ...jobs[0] }]
  update.mockClear()
  vi.useFakeTimers()
  vi.stubGlobal('window', { sanas: { jobs: { update } } })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('defaults to Overview and preserves unsaved context/email through tab switches and Save', async () => {
  let page = render()
  expect(page.tab('Overview').props['aria-selected']).toBe(true)
  let overview = page.child(JobOverview).props
  overview.setJob({ ...overview.job, name: 'Unsaved name', notes: 'Unsaved context' })
  page.tab('Email').props.onClick()
  page = render()
  const email = page.child(JobEmail).props
  email.setJob({ ...email.job, summaryEmail: 'draft@example.com' })
  page.tab('Meetings').props.onClick()
  page = render()
  page.tab('Overview').props.onClick()
  page = render()
  overview = page.child(JobOverview).props
  expect(overview.job).toMatchObject({
    name: 'Unsaved name',
    notes: 'Unsaved context',
    summaryEmail: 'draft@example.com',
  })
  expect(update).not.toHaveBeenCalled()
  await page.save()
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 1,
      name: 'Unsaved name',
      notes: 'Unsaved context',
      summaryEmail: 'draft@example.com',
    }),
  )
})

it('keeps the resume editor mounted and only one panel visible on every tab', () => {
  const first = render()
  expect(first.all.filter((n) => n.props.role === 'tab').map((n) => n.props.children)).toEqual([
    'Overview',
    'Resume',
    'Email',
    'Meetings',
  ])
  expect(first.all.some((n) => n.props.role === 'tab' && n.props.children === 'Presentation')).toBe(
    false,
  )
  const originals = [JobResume].map((type) => first.child(type))
  for (const name of ['Resume', 'Email', 'Meetings', 'Overview']) {
    render().tab(name).props.onClick()
    const page = render()
    const panels = page.all.filter((n) => n.props.role === 'tabpanel')
    expect(panels).toHaveLength(4)
    expect(panels.filter((n) => !n.props.hidden).map((n) => n.key)).toEqual([name])
    for (const original of originals) {
      const editor = page.child(original.type)
      expect(editor.key).toBe(original.key)
      expect(editor.props).toEqual(original.props)
    }
  }
})

it('supports keyboard navigation with wrapping, Home and End', () => {
  const focus = vi.fn()
  const getElementById = vi.fn(() => ({ focus }))
  vi.stubGlobal('document', { getElementById })
  for (const [from, key, to] of [
    ['Overview', 'ArrowLeft', 'Meetings'],
    ['Meetings', 'ArrowRight', 'Overview'],
    ['Overview', 'End', 'Meetings'],
    ['Meetings', 'Home', 'Overview'],
  ]) {
    const preventDefault = vi.fn()
    render().tab(from).props.onKeyDown({ key, preventDefault })
    expect(render().tab(to).props['aria-selected']).toBe(true)
    expect(getElementById).toHaveBeenLastCalledWith(`job-tab-${to}`)
    expect(preventDefault).toHaveBeenCalledOnce()
  }
})

// useState slots in JobDetail: 0 job, 6 savedJob, 7 resumeDirty, 8 step, 9 contentVersion.
const linked = () => ({ ...jobs[0], applicationId: 'acme-platform' })
const button = (page: ReturnType<typeof render>, label: string) =>
  page.all.find((n) => n.type === 'button' && n.props.children === label)

it('offers Refresh from application only for a linked job', () => {
  hooks.values[0] = linked()
  expect(button(render(), 'Refresh from application')).toBeDefined()
  hooks.values = [{ ...jobs[0], applicationId: null }]
  expect(button(render(), 'Refresh from application')).toBeUndefined()
})

it('asks before refreshing over unsaved edits; discarding restores the saved job and previews', () => {
  const saved = linked()
  hooks.values[0] = { ...saved, name: 'Unsaved name' }
  hooks.values[6] = saved
  button(render(), 'Refresh from application')!.props.onClick()
  let page = render()
  expect(page.all.some((n) => n.type === ApplicationPreview)).toBe(false)
  expect(page.all.some((n) => n.props.role === 'alertdialog')).toBe(true)

  button(page, 'Discard changes and review')!.props.onClick()
  expect(hooks.values[0]).toBe(saved)
  page = render()
  expect(page.child(ApplicationPreview).props).toMatchObject({ applicationId: 'acme-platform' })
})

it('goes straight to the application preview with nothing unsaved', () => {
  const saved = linked()
  hooks.values[0] = { ...saved }
  hooks.values[6] = saved
  button(render(), 'Refresh from application')!.props.onClick()
  const page = render()
  expect(page.child(ApplicationPreview).props).toMatchObject({ applicationId: 'acme-platform' })
})

it('opens the counted delete dialog for this job', () => {
  hooks.values[0] = linked()
  button(render(), 'Delete job…')!.props.onClick()
  expect(render().child(JobDeleteDialog).props).toMatchObject({ jobId: jobs[0].id })
})
