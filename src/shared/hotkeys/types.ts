// Global shortcut contracts shared by registration (main), the preload bridge and Settings.
export type HotkeyAction =
  | 'composeHotkey'
  | 'overlayHotkey'
  | 'assistHotkey'
  | 'captureHotkey'
  | 'presentationPrevHotkey'
  | 'presentationNextHotkey'
export interface HotkeyStatus {
  action: HotkeyAction
  accelerator: string
  registered: boolean
  error?: string
}
