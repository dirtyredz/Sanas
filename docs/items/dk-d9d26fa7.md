---
id: dk-d9d26fa7
type: task
created: 2026-11-03
status: todo
since: 2026-11-03
area: assistant
priority: P3
rank: zzzzzzzzzzzzw
parent:
fixes: []
blocked_by: []
relates: []
---
# Merge supportsEffort and thinkingOff into one per-family capability record in claude.ts

From the 7e9de35 sign-off: model-family knowledge lives in two regex predicates (supportsEffort, thinkingOff); the Sonnet short-budget shape works only because both match Sonnet. When the next model family or quirk lands, resolve one private record {effort, thinkingOff?} per request. A mismatch 400s every automatic answer (see GOTCHAS).
