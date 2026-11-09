import { app } from 'electron'
import { subscribeMeeting } from '../services/meetings/observation/meeting-observation'
import { hideOverlay } from '../windows/overlay-window'
import { onMainWindowClosed } from '../windows/main-window'

/** App-level window policy, next to the other quit/lifecycle rules in ./start.ts:
 *  - The main window is the app. The overlay and mock windows are BrowserWindows too, so
 *    'window-all-closed' never fires while one is open; closing the main window quits Sanas
 *    (the before-quit path in start.ts still ends a running mock first).
 *  - The overlay hides when a meeting ends (Stop, overlay Stop, end of a mock). Pause keeps
 *    a meetingId and never reaches an idle state. */
export function registerWindowPolicy(): void {
  onMainWindowClosed(() => app.quit())
  subscribeMeeting((e) => {
    if (e.kind === 'state' && e.value.status === 'idle' && e.value.meetingId === null) hideOverlay()
  })
}
