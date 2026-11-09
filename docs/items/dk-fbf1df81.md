---
id: dk-fbf1df81
type: task
created: 2026-11-09
status: todo
since: 2026-11-09
area: assist
priority: P3
rank: zzzzzzzzzzzzzzz
parent:
fixes: []
blocked_by: []
relates: [dk-664193d9]
---
# Past-meeting retrieval hit rate under event-loop jitter at large corpora


Fixture runs (scripts/rehearsal/trials/history-latency.ps1) at 1M segments: automatic retrieval wait p95 20 ms / p99 39 ms against a 10 ms budget, 45/60 warm hits; 10k segments 53/60. Late evidence is dropped so answers lose past-meeting snippets, they are not delayed beyond ~10 ms p95. Main-thread event-loop scheduling (p99 ~32 ms) is the cause, not SQLite (query p95 ~3.5 ms). Direction: isolate host scheduling in the fixture, then decide whether to issue retrieval earlier (at turn close / speculation start) so the deadline is met more often. Real corpora today are small (a few meetings).
