import { describe, expect, it } from 'vitest'
import { splitSummaryOutput } from './summary-output'

describe('splitSummaryOutput', () => {
  it('keeps Markdown knowledge sections in summary and actions in their existing column', () => {
    expect(
      splitSummaryOutput(`SUMMARY
**Overview**
The migration is ready.

**Specifics**
- Deploy branch \`feat/catalog-v2\` to \`sandbox\`.

ACTION ITEMS
- **Mina** — deploy the branch — due 2026-11-02`),
    ).toEqual({
      summary:
        '**Overview**\nThe migration is ready.\n\n**Specifics**\n- Deploy branch `feat/catalog-v2` to `sandbox`.',
      actions: '- **Mina** — deploy the branch — due 2026-11-02',
    })
  })

  it('does not split on an action-items phrase inside the knowledge extract', () => {
    const text = `SUMMARY
**What we learned**
The action items view reads from a separate column.

ACTION ITEMS
`
    expect(splitSummaryOutput(text)).toEqual({
      summary: '**What we learned**\nThe action items view reads from a separate column.',
      actions: '',
    })
  })

  it('tolerates Markdown outer headings and a missing action marker', () => {
    expect(
      splitSummaryOutput('## SUMMARY\n**Overview**\nA result.\n\n## ACTION ITEMS\n- Verify it'),
    ).toEqual({
      summary: '**Overview**\nA result.',
      actions: '- Verify it',
    })
    expect(splitSummaryOutput('SUMMARY\n**Overview**\nA result.')).toEqual({
      summary: '**Overview**\nA result.',
      actions: '',
    })
  })
})
