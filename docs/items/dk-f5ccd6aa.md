---
id: dk-f5ccd6aa
type: task
created: 2026-11-06
status: todo
since: 2026-11-06
area: structure
priority: P2
rank: zzzzzzzzzzzzzzzzzzzzzw
parent:
fixes: []
blocked_by: []
relates: []
---
# Job deletion result leaks the backup's absolute path to the renderer


From the job import/delete pre-push review (abstraction lens, 2026-11-06).

`src/shared/jobs/deletion.ts` exposes the DB backup's absolute filesystem path; `src/renderer/src/app/jobs/deletion/deletion-copy.ts` formats it directly. A storage detail crosses the IPC seam.

Direction: return a recovery receipt/status and keep backup-path handling behind a main-process recovery/reveal operation.
