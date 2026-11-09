import type { GlossaryTerm } from '@shared/types'
import { contextSize } from './context-size'
export function ContextSizeMeter({
  notes,
  draftNotes,
  memory,
  terms,
}: {
  notes: string
  draftNotes: string
  memory: string
  terms: GlossaryTerm[]
}): React.JSX.Element {
  const size = contextSize(notes, memory, terms)
  return (
    <section aria-label="Context size">
      <span className="eyebrow">Context size</span>
      <p className={size.large ? 'warn' : 'hint'}>
        {size.chars.toLocaleString()} characters · approximately {size.tokens.toLocaleString()}{' '}
        tokens{size.large && ' · Large context'}
      </p>
      {notes !== draftNotes && (
        <p className="hint">
          With unsaved Notes: {contextSize(draftNotes, memory, terms).chars.toLocaleString()}{' '}
          characters.
        </p>
      )}
      <p className="hint">
        Notes + approved memory + glossary only. Excludes proposals and other prompt fields.
      </p>
    </section>
  )
}
