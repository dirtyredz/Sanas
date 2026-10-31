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
  // detail and screen answers carry prose plus a fix block: the compact renderer would drop it
  return manualKind === 'detail' || manualKind === 'capture' ? (
    <DetailedSuggestion text={text} />
  ) : (
    <CompactSuggestion text={text} />
  )
}
