/** Deliberately text-only: preserve all detail paragraphs and code, never interpret HTML. */
export function DetailedSuggestion({ text }: { text: string }): React.JSX.Element {
  const chunks = text.replace(/\r\n?/g, '\n').split(/(```[^\n]*\n[\s\S]*?(?:```|$))/g)
  return (
    <div className="detailed-suggestion">
      {chunks.map((chunk, i) =>
        chunk.startsWith('```') ? (
          <pre key={i}>
            <code>
              {chunk
                .replace(/^```[^\n]*\n/, '')
                .replace(/```$/, '')
                .trimEnd()}
            </code>
          </pre>
        ) : (
          chunk
            .split(/\n\s*\n/)
            .filter(Boolean)
            .map((paragraph, j) => (
              <p key={`${i}-${j}`} style={{ whiteSpace: 'pre-wrap' }}>
                {paragraph
                  .split(/(\*\*[^*]+\*\*)/g)
                  .map((part, k) =>
                    part.startsWith('**') && part.endsWith('**') ? (
                      <strong key={k}>{part.slice(2, -2)}</strong>
                    ) : (
                      part
                    ),
                  )}
              </p>
            ))
        ),
      )}
    </div>
  )
}
