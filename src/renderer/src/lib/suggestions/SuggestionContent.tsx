import type { ManualKind } from '@shared/live-controls/types'
import { CompactSuggestion } from './CompactSuggestion'
import { DetailedSuggestion } from './DetailedSuggestion'
export function SuggestionContent({
  text,
  manualKind,
}: {
  text: string
  manualKind?: ManualKind | null
}): React.JSX.Element {
  return manualKind === 'detail' ? (
    <DetailedSuggestion text={text} />
  ) : (
    <CompactSuggestion text={text} />
  )
}
