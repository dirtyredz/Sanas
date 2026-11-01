import { Badge } from './Badge'

/** Whether a stored secret exists; the value itself never reaches the renderer. */
export function KeyBadge({ set }: { set: boolean }): React.JSX.Element {
  return set ? <Badge tone="ok">Saved</Badge> : <Badge tone="warn">Not set</Badge>
}
