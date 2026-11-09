import { splitFiller } from '@shared/suggestion/filler-marker'

/** Text with ⟨…⟩ filler spans rendered subtly (dimmed italic). The markers themselves are
 *  never shown; plain text renders as itself. */
export function FillerText({ text }: { text: string }): React.JSX.Element {
  return (
    <>
      {splitFiller(text).map((part, index) =>
        part.filler ? (
          <span key={index} className="filler" title="Improvised — not from your facts">
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </>
  )
}
