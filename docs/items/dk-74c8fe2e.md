---
id: dk-74c8fe2e
type: task
created: 2026-10-31
status: todo
since: 2026-10-31
area:
priority: P3
rank: w
parent:
fixes: []
blocked_by: []
relates: []
---
# Pick one convention for src/shared/ domain folders


Source: structure review 2026-10-31 (topology lens).

`src/shared/` mixes loose files (`ipc.ts`, `types.ts`, `suggestion-label.ts`, `search-markers`, `summary-markdown`) with single-file domain folders (`live-controls/types.ts`, `updates/types.ts`). The same concept has two shapes side by side.

Direction: either per-domain folders throughout (group the loose text helpers), or flat single-file domains. Choose one and apply it.
