// The divider between the answer preview (above) and a secondary workspace (below). The ratio
// is the answer preview's share of the content height; it persists as the existing
// `overlayWhisperRatio` setting, which has always meant "the answer's share".

export const DEFAULT_ANSWER_RATIO = 0.27
export const MIN_PREVIEW_HEIGHT = 96
export const MIN_WORKSPACE_HEIGHT = 96
export const DIVIDER_HEIGHT = 8
/** One keyboard step on the focused divider. */
export const DIVIDER_STEP = 16

export interface OverlaySplit {
  previewHeight: number
  workspaceHeight: number
  ratio: number
}

function finiteRatio(ratio: number): number {
  return Number.isFinite(ratio) ? ratio : DEFAULT_ANSWER_RATIO
}

/** Turns the durable answer share into pixel tracks, clamped for the current window. Below
 *  both minimums (the smallest window) the space is shared proportionally. */
export function overlaySplit(containerHeight: number, ratio: number): OverlaySplit {
  const available = Math.max(0, containerHeight - DIVIDER_HEIGHT)
  const minimumTotal = MIN_PREVIEW_HEIGHT + MIN_WORKSPACE_HEIGHT

  if (available < minimumTotal) {
    const previewHeight = Math.round(available * (MIN_PREVIEW_HEIGHT / minimumTotal))
    return {
      previewHeight,
      workspaceHeight: available - previewHeight,
      ratio: previewHeight / Math.max(1, available),
    }
  }

  const requested = Math.round(available * finiteRatio(ratio))
  const previewHeight = Math.min(
    available - MIN_WORKSPACE_HEIGHT,
    Math.max(MIN_PREVIEW_HEIGHT, requested),
  )
  return {
    previewHeight,
    workspaceHeight: available - previewHeight,
    ratio: previewHeight / available,
  }
}

/** Converts a dragged preview height back to the ratio persisted in Settings. */
export function answerRatioFromHeight(containerHeight: number, previewHeight: number): number {
  const available = Math.max(1, containerHeight - DIVIDER_HEIGHT)
  return overlaySplit(containerHeight, previewHeight / available).ratio
}
