// Bounding one long piece of speech for a prompt: the opening says what it is about and the
// ending says what is being asked, so both survive and the middle is marked as omitted.

const MARKER = ' […] '

export function boundedExcerpt(text: string, cap: number): string {
  if (text.length <= cap) return text
  if (cap <= MARKER.length + 2) return text.slice(-cap)
  const room = cap - MARKER.length
  const head = Math.floor(room / 2)
  return `${text.slice(0, head)}${MARKER}${text.slice(text.length - (room - head))}`
}
