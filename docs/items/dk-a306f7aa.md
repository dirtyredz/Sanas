---
id: dk-a306f7aa
type: bug
created: 2026-10-05
status: done
since: 2026-11-09
area: post-v1-ideas
priority: P3
rank: zt
parent:
fixes: []
blocked_by: []
relates: []
---

# On-screen clock keeps counting until main confirms a pause (display only)

From docs/BACKLOG.md (P2 — Post-v1 ideas / Live-meeting polish):

- [ ] The on-screen clock keeps counting until main confirms a pause, so it can include the
      WebSocket shutdown handshake after capture already stopped. Stored timestamps and the
      WAV are unaffected — this is display only.

Resolution (2026-11-09): Clock now stops when Pause is pressed (clockRunning in meeting-state.ts, pausing flag in LiveMeetingPage) instead of when main confirms; restored if the pause call fails.
