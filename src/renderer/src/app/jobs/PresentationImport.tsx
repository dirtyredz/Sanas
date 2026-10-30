import { useState } from 'react'
import type { Slide } from '@shared/presentation/types'
import { parsePresentation } from './presentation-import'

export function PresentationImport({
  apply,
}: {
  apply: (slides: Slide[], replace: boolean) => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [replace, setReplace] = useState(false)
  const result = parsePresentation(text)
  return (
    <details>
      <summary>Paste import</summary>
      <textarea
        aria-label="Paste presentation"
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <label>
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        Replace draft (otherwise append)
      </label>
      {text && (
        <>
          <p>{result.slides.length} slides</p>
          {result.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
          {result.slides.map((s, i) => (
            <details key={i}>
              <summary>
                {i + 1}. {s.title || '(missing title)'}
              </summary>
              <pre>{s.talkingPoint || '(missing talking point)'}</pre>
              <pre>{s.script}</pre>
              <pre>{s.keyFacts}</pre>
            </details>
          ))}
          {result.error && <p role="alert">{result.error}</p>}
        </>
      )}
      <button
        className="btn"
        disabled={!!result.error}
        onClick={() => apply(result.slides, replace)}
      >
        Apply to draft
      </button>
    </details>
  )
}
