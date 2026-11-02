---
id: dk-fde1d6d4
type: task
created: 2026-11-02
status: todo
since: 2026-11-02
area: rehearsal
priority: P2
rank: zzzzzzzzzzzzzzy
parent:
fixes: []
blocked_by: []
relates: [dk-50c47b5d]
---
# Accept in-app mock interviews with real devices and paid providers

Owner-only acceptance of the in-app Mock interview feature (implementation dk-09b23dd5). From this worktree run npm run dev in a real terminal after closing other Sanas instances; this uses normal userData and saved app keys. Open Mock interview, choose Job interview or Client Q&A and a job, use headphones, then Start. Verify automatic This PC mic/loopback capture, separate window persona/captions/status, local Windows speech on default output reaching loopback, owner mic identity, adaptive follow-ups, skip/end/dismiss controls, window-close and library-close cleanup, real Screen capture with overlay on the interviewer display, and saved Practice transcript/suggestions/summary/results. Verify normal history/Search/Ask exclude practice while past practice sessions expose complete records and latency/outcome evidence. Check v8 migration/backup on the owner Electron build. The old -Tier live launcher is retired. Free stubbed/provider/finals/SQLite tests and canned rehearsals do not establish actual voice/device/provider quality. No implementation agent should fetch keys or start a real mic session.
