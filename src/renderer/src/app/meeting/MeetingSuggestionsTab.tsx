import type { Suggestion } from '@shared/types'
import { suggestionLabel, suggestionOrigin } from '@shared/suggestion/suggestion-label'
import { formatClock } from '../../lib/format-time'
import { SuggestionContent } from '../../lib/suggestions/SuggestionContent'

/** A saved meeting's suggestions, with source/detail links between follow-ups. */
export function MeetingSuggestionsTab({
  suggestions,
}: {
  suggestions: Suggestion[]
}): React.JSX.Element {
  return (
    <div className="transcript">
      {suggestions.length === 0 && <p className="empty">No suggestions were generated.</p>}
      {suggestions.map((s) => (
        <div key={s.id} id={`suggestion-${s.id}`} className="suggestion-entry">
          <p className="line">
            <span className="ts">{formatClock(s.tMs)}</span>
            <span className="who">{suggestionLabel(s)}</span>
            <span className="text muted">{suggestionOrigin(s)}</span>
          </p>
          <div className="suggestion-body">
            {s.requestText && <p>Request: {s.requestText}</p>}
            {s.sourceSuggestionId && (
              <a href={`#suggestion-${s.sourceSuggestionId}`}>Back to source</a>
            )}
            {suggestions
              .filter((child) => child.sourceSuggestionId === s.id)
              .map((child) => (
                <a key={child.id} href={`#suggestion-${child.id}`}>
                  More detail
                </a>
              ))}
            <SuggestionContent text={s.text} manualKind={s.manualKind} />
          </div>
        </div>
      ))}
    </div>
  )
}
