import type { PresentationHistory, SlideEvent } from './types'

export type TimelineEntry<T> =
  | { kind: 'segment'; segment: T; tMs: number }
  | { kind: 'slide'; event: SlideEvent; title: string; tMs: number }

export function presentationTimeline<T extends { tStartMs?: number }>(
  segments: readonly T[],
  history: PresentationHistory,
): TimelineEntry<T>[] {
  const rows: TimelineEntry<T>[] = segments.map((segment) => ({
    kind: 'segment',
    segment,
    tMs: segment.tStartMs ?? 0,
  }))
  rows.push(
    ...history.events.map((event) => ({
      kind: 'slide' as const,
      event,
      title: history.slides[event.ordinal]?.title ?? '',
      tMs: event.tMs,
    })),
  )
  return rows.sort(
    (a, b) =>
      a.tMs - b.tMs ||
      (a.kind === 'slide'
        ? b.kind === 'slide'
          ? a.event.revision - b.event.revision
          : -1
        : b.kind === 'slide'
          ? 1
          : 0),
  )
}

export function slideMarker(event: SlideEvent, title: string): string {
  return `Slide ${event.ordinal + 1} — ${title}`
}
