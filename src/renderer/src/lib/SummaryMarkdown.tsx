import type { ReactNode } from 'react'
import { parseSummaryInline, parseSummaryMarkdown } from '@shared/summary-markdown'

function Inline({ text }: { text: string }): React.JSX.Element {
  return (
    <>
      {parseSummaryInline(text).map((part, index): ReactNode => {
        if (part.kind === 'code') return <code key={index}>{part.text}</code>
        if (part.kind === 'strong') return <strong key={index}>{part.text}</strong>
        return part.text
      })}
    </>
  )
}

/** Safe renderer for the constrained Markdown contract used by knowledge summaries. */
export function SummaryMarkdown({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="summary-markdown">
      {parseSummaryMarkdown(text).map((block, index) => {
        if (block.kind === 'heading') return <h3 key={index}>{block.text}</h3>
        if (block.kind === 'list') {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Inline text={item} />
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={index}>
            <Inline text={block.text} />
          </p>
        )
      })}
    </div>
  )
}
