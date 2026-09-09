/** Electron accelerator → what the keycap says on Windows: "CommandOrControl+Shift+Space"
 *  becomes "Ctrl+Shift+Space". Shown in the sidebar and the Settings hotkey fields. */
export function hotkeyLabel(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => {
      switch (part) {
        case 'CommandOrControl':
        case 'CmdOrCtrl':
        case 'Control':
          return 'Ctrl'
        case 'Super':
          return 'Win'
        case 'Return':
          return 'Enter'
        default:
          return part
      }
    })
    .join('+')
}
