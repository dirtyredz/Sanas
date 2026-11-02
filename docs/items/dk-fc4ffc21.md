---
id: dk-fc4ffc21
type: task
created: 2026-11-02
status: todo
since: 2026-11-02
area: mock-interview
priority: P2
rank: zzzzzzzzzzzzzzzzt
parent:
fixes: []
blocked_by: []
relates: []
---
# Remove the mock-interview turns/ <-> parent import cycle


Push sign-off 2026-11-02: `mock-interview/turns/session.ts` imports `../evidence`, while `evidence.ts` (and `report.ts`) import `./turns/engine`, so the subfolder and its parent depend on each other.

Acceptance: move evidence/report into `turns/` or inject evidence from the parent; no cycle.
