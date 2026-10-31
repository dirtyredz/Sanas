export const OVERLAY_OPACITY_SAVE_MS = 50

/** Coalesces range-input events while ensuring the last selected opacity is persisted. */
export function createOverlayOpacitySaver(
  save: (opacity: number) => Promise<unknown>,
  delayMs = OVERLAY_OPACITY_SAVE_MS,
): { schedule: (opacity: number) => void; dispose: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: number | null = null

  const flush = (): void => {
    timer = null
    const opacity = pending
    pending = null
    if (opacity === null) return
    void save(opacity).catch((error) =>
      console.warn('[sanas] could not save the overlay opacity:', error),
    )
  }

  return {
    schedule(opacity) {
      pending = opacity
      if (timer === null) timer = setTimeout(flush, delayMs)
    },
    dispose() {
      if (timer !== null) clearTimeout(timer)
      timer = null
      pending = null
    },
  }
}
