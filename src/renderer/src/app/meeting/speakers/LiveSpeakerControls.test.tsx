import { afterEach, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { LiveSpeakerControls } from './LiveSpeakerControls'
import type { SpeakerIdentityStatus } from '@shared/meeting/speaker-identity'
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.values)) hooks.values[slot] = initial
    return [
      hooks.values[slot],
      (value: unknown) => {
        hooks.values[slot] = value
      },
    ]
  },
}))
type Props = {
  children?: ReactNode
  onClick: () => void
  disabled?: boolean
  className?: string
  role?: string
}
function nodes(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (!isValidElement<Props>(node)) return []
  return [node, ...nodes(node.props.children)]
}
const render = (identity: SpeakerIdentityStatus) => {
  hooks.cursor = 0
  return nodes(LiveSpeakerControls({ identity }))
}
afterEach(() => {
  hooks.values = []
  vi.unstubAllGlobals()
})

it('awaits failures, retains the cue and uses only main-confirmed selection', async () => {
  let reject!: (e: Error) => void
  const pinSpeaker = vi.fn(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail
      }),
  )
  vi.stubGlobal('window', { sanas: { meeting: { pinSpeaker } } })
  const identity = {
    identityNeedsConfirmation: true,
    currentSpeakerIds: [2],
    selectedSpeakerIds: [0],
  }
  const buttons = () => render(identity).filter((node) => node.type === 'button')
  buttons()[0].props.onClick()
  expect(pinSpeaker).toHaveBeenCalledWith(2, true)
  expect(buttons()[0].props.disabled).toBe(true)
  expect(buttons()[0].props.className).not.toContain('me')
  reject(new Error('Pin failed'))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(buttons()[0].props.disabled).toBe(false)
  expect(render(identity).find((node) => node.props.role === 'alert')?.props.children).toContain(
    'Pin failed',
  )
  expect(
    render(identity).some((node) =>
      String(node.props.children).includes('Identify your voice again'),
    ),
  ).toBe(true)
  const confirmed = render({
    ...identity,
    identityNeedsConfirmation: false,
    selectedSpeakerIds: [0, 2],
  })
  expect(
    confirmed.some((node) => String(node.props.children).includes('Identify your voice again')),
  ).toBe(false)
  expect(confirmed.find((node) => node.type === 'button')?.props.className).toContain('me')
})
