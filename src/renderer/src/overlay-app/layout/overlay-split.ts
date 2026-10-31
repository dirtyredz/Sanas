export const DEFAULT_WHISPER_RATIO = 0.27
export const MIN_TRANSCRIPT_HEIGHT = 60
export const MIN_WHISPER_HEIGHT = 120
export const MAXIMIZED_TRANSCRIPT_HEIGHT = 18
export const SPLITTER_HEIGHT = 8

export interface OverlaySplit {
  transcriptHeight: number
  whisperHeight: number
  ratio: number
}

function finiteRatio(ratio: number): number {
  return Number.isFinite(ratio) ? ratio : DEFAULT_WHISPER_RATIO
}

/** Turns a durable whisper share into pixel tracks, clamped for the current window. */
export function overlaySplit(containerHeight: number, ratio: number): OverlaySplit {
  const available = Math.max(0, containerHeight - SPLITTER_HEIGHT)
  const minimumTotal = MIN_TRANSCRIPT_HEIGHT + MIN_WHISPER_HEIGHT

  if (available < minimumTotal) {
    const whisperHeight = Math.round(available * (MIN_WHISPER_HEIGHT / Math.max(1, minimumTotal)))
    return {
      transcriptHeight: available - whisperHeight,
      whisperHeight,
      ratio: whisperHeight / Math.max(1, available),
    }
  }

  const requested = Math.round(available * finiteRatio(ratio))
  const whisperHeight = Math.min(
    available - MIN_TRANSCRIPT_HEIGHT,
    Math.max(MIN_WHISPER_HEIGHT, requested),
  )
  return {
    transcriptHeight: available - whisperHeight,
    whisperHeight,
    ratio: whisperHeight / available,
  }
}

/** Converts a dragged pixel height back to the ratio persisted in Settings. */
export function whisperRatioFromHeight(containerHeight: number, whisperHeight: number): number {
  const available = Math.max(1, containerHeight - SPLITTER_HEIGHT)
  return overlaySplit(containerHeight, whisperHeight / available).ratio
}
