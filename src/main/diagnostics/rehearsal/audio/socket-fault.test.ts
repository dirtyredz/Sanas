import { expect, it, vi } from 'vitest'
import { installSocketFaults } from './socket-fault'

it('closes the real session socket abnormally and counts reopened connections', () => {
  const close = vi.fn()
  class Socket extends EventTarget {
    static OPEN = 1
    readyState = 1
    close(code?: number): void {
      close(code)
      this.dispatchEvent(new Event('close'))
    }
  }
  vi.stubGlobal('WebSocket', Socket)
  try {
    const faults = installSocketFaults()
    const first = new WebSocket('wss://test.invalid')
    first.dispatchEvent(new Event('open'))
    faults.drop()
    expect(close).toHaveBeenCalledWith(4000)
    const next = new WebSocket('wss://test.invalid')
    next.dispatchEvent(new Event('open'))
    expect(faults.opened()).toBe(2)
    faults.close()
    expect(globalThis.WebSocket).toBe(Socket)
  } finally {
    vi.unstubAllGlobals()
  }
})
