export type HotkeyAction =
  'overlayHotkey' | 'assistHotkey' | 'presentationPrevHotkey' | 'presentationNextHotkey'
export interface HotkeyStatus {
  action: HotkeyAction
  accelerator: string
  registered: boolean
  error?: string
}
