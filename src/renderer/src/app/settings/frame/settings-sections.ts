/** The Settings page's sections in page order: the index, the anchors and the section cards
 *  all read this one list, so a section cannot appear in one and not the other. */
export const SETTINGS_SECTIONS = [
  { id: 'api-keys', title: 'API keys' },
  { id: 'assistant', title: 'Assistant' },
  { id: 'hotkeys', title: 'Hotkeys' },
  { id: 'microphone', title: 'Microphone' },
  { id: 'overlay', title: 'Overlay' },
  { id: 'email', title: 'Summary email' },
  { id: 'retention', title: 'Retention' },
  { id: 'updates', title: 'Updates' },
] as const

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id']

export function sectionTitle(id: SettingsSectionId): string {
  return SETTINGS_SECTIONS.find((s) => s.id === id)?.title ?? id
}

/** DOM id of a section card; the index scrolls to it. */
export function sectionAnchor(id: SettingsSectionId): string {
  return `settings-${id}`
}

/** Which section the reader is in: the last one whose top has passed `threshold` px below the
 *  top of the scroll area. At the very bottom the last section wins even when it is too short
 *  to reach the threshold. `positions` are in page order. */
export function activeSectionId<T extends string>(
  positions: readonly { id: T; top: number }[],
  threshold: number,
  atBottom: boolean,
): T | null {
  if (positions.length === 0) return null
  if (atBottom) return positions[positions.length - 1].id
  let active = positions[0].id
  for (const p of positions) {
    if (p.top <= threshold) active = p.id
    else break
  }
  return active
}
