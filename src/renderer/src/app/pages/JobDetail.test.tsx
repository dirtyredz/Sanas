import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { Job } from '@shared/types'
import { jobs } from '../../dev/mock-fixtures'
import { JobTabs } from '../jobs/JobTabs'
import { JobDetail } from './JobDetail'
import { JobOverview } from '../jobs/JobOverview'
import { JobEmail } from '../jobs/JobEmail'
import { PresentationEditor } from '../jobs/PresentationEditor'

// Exercise page callbacks and successive renders without adding a DOM dependency.
// Child identity assertions cover the mounted editor boundary, including local slide drafts.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: () => {},
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
  page.tab('Presentation').props.onClick()
  page = render()
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

it('keeps the same presentation editor mounted and only one panel visible on every tab', () => {
  const original = render().child(PresentationEditor)
  for (const name of ['Presentation', 'Email', 'Meetings', 'Overview']) {
    render().tab(name).props.onClick()
    const page = render()
    const panels = page.all.filter((n) => n.props.role === 'tabpanel')
    expect(panels).toHaveLength(4)
    expect(panels.filter((n) => !n.props.hidden).map((n) => n.key)).toEqual([name])
    const editor = page.child(PresentationEditor)
    expect(editor.type).toBe(original.type)
    expect(editor.key).toBe(original.key)
    expect(editor.props).toEqual(original.props)
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
