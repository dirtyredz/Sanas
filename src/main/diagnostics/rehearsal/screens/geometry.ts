export interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}
/** Coordinates are DIP relative to the selected display/content, then thumbnail pixels.
 * Scale factor is already embodied in capture dimensions; do not apply it again. */
export function mapRectangle(
  rect: Rectangle,
  bounds: Rectangle,
  size: { width: number; height: number },
): Rectangle {
  if (
    rect.x < bounds.x ||
    rect.y < bounds.y ||
    rect.x + rect.width > bounds.x + bounds.width ||
    rect.y + rect.height > bounds.y + bounds.height
  )
    throw new Error('Rectangle is outside fixture content')
  const x = Math.round(((rect.x - bounds.x) * size.width) / bounds.width)
  const y = Math.round(((rect.y - bounds.y) * size.height) / bounds.height)
  return {
    x,
    y,
    width: Math.round(((rect.x + rect.width - bounds.x) * size.width) / bounds.width) - x,
    height: Math.round(((rect.y + rect.height - bounds.y) * size.height) / bounds.height) - y,
  }
}
