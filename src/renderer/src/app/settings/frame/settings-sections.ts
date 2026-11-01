/** The Settings sections in index order: the index, the pager and the section pages all read
 *  this one list, so a section cannot appear in one and not the other. */
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

/** DOM id of a section card (its heading labels the card). */
export function sectionAnchor(id: SettingsSectionId): string {
  return `settings-${id}`
}
