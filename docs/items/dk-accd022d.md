---
id: dk-accd022d
type: task
created: 2026-11-03
status: done
since: 2026-11-09
area: storage
priority: P3
rank: zzzzzzzzn
parent:
fixes: []
blocked_by: []
relates: []
---
# Harden DB startup and shutdown: read-only integrity gate before migration; close DB even if update cleanup throws


From the 2026-11-03 DB diagnosis (false alarm caused by Claude's virtualized %APPDATA% view; the real database was healthy). Optional hardening, no proven bug:

- Before backup or migration in `src/main/db/index.ts`, run a read-only integrity and foreign-key check. On failure, refuse to migrate or start, with an actionable message. Never auto-repair, delete the WAL or restore.
- In `src/main/lifecycle/start.ts` will-quit, make sure `closeDb()` runs even if `stopUpdates()` throws.
- Keep `repos/diagnostics.ts` (a write-bearing smoke probe) separate from that read-only check.
- Cheap test: a mismatched main+WAL fixture is refused with no migration callback and nothing overwritten.

Evidence: diagnosis report in worktree `.worktrees/sanas/diag-db-damage/.tmp/diagnosis-report.md` (local only, holds private data).
