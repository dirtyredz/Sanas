/** Roving tab selection; arrows on the other axis and unrelated keys are ignored. */
export function nextTabIndex(
  key: string,
  index: number,
  count: number,
  orientation: 'horizontal' | 'vertical',
): number | null {
  if (count <= 0) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  const forward = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
  const backward = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
  if (key === forward) return (index + 1) % count
  if (key === backward) return (index + count - 1) % count
  return null
}
