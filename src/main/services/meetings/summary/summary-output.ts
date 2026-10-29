export interface SummaryOutput {
  summary: string
  actions: string
}

/** Splits the model's outer storage contract without mistaking prose that mentions action items
 *  for the delimiter. Markdown heading markers are tolerated if a model adds them anyway. */
export function splitSummaryOutput(text: string): SummaryOutput {
  const normalized = text.replace(/\r\n?/g, '\n')
  const marker = /^#{0,6}\s*ACTION ITEMS\s*$/im.exec(normalized)
  const summaryEnd = marker?.index ?? normalized.length
  const actionsStart = marker ? marker.index + marker[0].length : normalized.length
  const summary = normalized
    .slice(0, summaryEnd)
    .replace(/^#{0,6}\s*SUMMARY\s*$/im, '')
    .trim()
  const actions = marker ? normalized.slice(actionsStart).trim() : ''
  return { summary, actions }
}
