---
id: dk-a9ef3ebd
type: task
created: 2026-11-04
status: todo
since: 2026-11-04
area: assist
priority: P3
rank: zzzzzzzzzzzzy
parent:
fixes: []
blocked_by: []
relates: []
---
# Route the completion-path start emit through RunPublication; fix two stale lifecycle doc lines

From the v0.1.13 sign-off: (1) suggestion-runner.ts ~l.241 emits start directly (if !gate.shown emit('start','')) bypassing RunPublication, so shown is decided in two places; add gate.complete() or a force flag on reveal. (2) STRUCTURE.md ~l.288 still says suggestion-runner owns the unpublished state; it is run-publication.ts now. (3) GOTCHAS.md ~l.335: lane is freed by cancel() or finally, whichever comes first (token makes the second a no-op); only the hold is released once in finally.
