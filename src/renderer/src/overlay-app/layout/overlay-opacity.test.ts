import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOverlayOpacitySaver, OVERLAY_OPACITY_SAVE_MS } from './overlay-opacity'

describe('overlay opacity saver', () => {
  afterEach(() => vi.useRealTimers())

  it('persists the latest drag value at most once per interval', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => undefined)
    const saver = createOverlayOpacitySaver(save)

    saver.schedule(0.8)
    saver.schedule(0.75)
    await vi.advanceTimersByTimeAsync(OVERLAY_OPACITY_SAVE_MS - 1)
    expect(save).not.toHaveBeenCalled()

    saver.schedule(0.7)
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith(0.7)
  })

  it('cancels a pending save when disposed', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => undefined)
    const saver = createOverlayOpacitySaver(save)

    saver.schedule(0.4)
    saver.dispose()
    await vi.runAllTimersAsync()

    expect(save).not.toHaveBeenCalled()
  })
})
