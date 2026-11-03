---
id: dk-2fa8a5b6
type: task
created: 2026-11-03
status: todo
since: 2026-11-03
area: docs
priority: P3
rank: zzzzzzzzzzz
parent:
fixes: []
blocked_by: []
relates: []
---
# Record the smoke report expectedSchemaVersion contract in STRUCTURE.md


Push review 2026-11-03 (componentization, P2): smoke.ts reports expectedSchemaVersion from db/migrations, and scripts/release/smoke.ps1 compares against it. Note that the two must change together in the scripts/release/ or diagnostics/ bullet (STRUCTURE.md:238).
