import { expect, it, vi } from 'vitest'
import { connectComposerActivation } from './useComposerActivation'

function bridge() {
  const calls: string[] = []
  const listeners = new Set<() => void>()
  return {
    calls,
    listeners,
    onCompose: (cb: () => void) => {
      calls.push('listen')
      listeners.add(cb)
      return () => {
        calls.push('remove')
        listeners.delete(cb)
      }
    },
    composerReady: async () => {
      calls.push('ready')
      // main delivers a held cold-start intent as soon as the renderer says it is ready
      listeners.forEach((cb) => cb())
    },
  }
}

it('installs the listener before announcing readiness, so a held intent is delivered', () => {
  const b = bridge()
  const activate = vi.fn()
  connectComposerActivation(b, activate)
  expect(b.calls).toEqual(['listen', 'ready'])
  expect(activate).toHaveBeenCalledOnce()
})

it('a remount neither loses nor duplicates an intent', () => {
  const b = bridge()
  const first = vi.fn()
  const second = vi.fn()
  connectComposerActivation(b, first)()
  connectComposerActivation(b, second)
  expect(b.listeners.size).toBe(1)
  b.listeners.forEach((cb) => cb())
  expect(first).toHaveBeenCalledOnce() // only its own ready-time delivery
  expect(second).toHaveBeenCalledTimes(2)
})

it('survives a failed readiness call', async () => {
  const activate = vi.fn()
  const remove = connectComposerActivation(
    { onCompose: () => () => {}, composerReady: () => Promise.reject(new Error('gone')) },
    activate,
  )
  await Promise.resolve()
  expect(typeof remove).toBe('function')
})
