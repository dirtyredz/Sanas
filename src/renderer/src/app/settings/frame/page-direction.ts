/** Which way a page change moves through an ordered list of pages: further down the list is
 *  'forward', back up it is 'back', and staying put (or an id not in the list) is 'none'.
 *  Settings animates the incoming page from this: forward slides up (left in the narrow strip),
 *  back reverses, none does not animate. */
export type PageDirection = 'forward' | 'back' | 'none'

export function pageDirection<T>(order: readonly T[], from: T, to: T): PageDirection {
  const a = order.indexOf(from)
  const b = order.indexOf(to)
  if (a < 0 || b < 0 || a === b) return 'none'
  return b > a ? 'forward' : 'back'
}
