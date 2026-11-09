import { describe, expect, it, vi } from 'vitest'
import { createObserverBus } from './observer-bus'

describe('createObserverBus', () => {
  it('delivers to every listener and stops after unsubscribe', () => {
    const bus = createObserverBus<number>()
    const a = vi.fn()
    const b = vi.fn()
    const off = bus.subscribe(a)
    bus.subscribe(b)
    bus.publish(1)
    off()
    bus.publish(2)
    expect(a.mock.calls).toEqual([[1]])
    expect(b.mock.calls).toEqual([[1], [2]])
  })

  it('a throwing listener neither throws nor starves the others', () => {
    const bus = createObserverBus<string>()
    const after = vi.fn()
    bus.subscribe(() => {
      throw new Error('boom')
    })
    bus.subscribe(after)
    expect(() => bus.publish('x')).not.toThrow()
    expect(after).toHaveBeenCalledWith('x')
  })
})
