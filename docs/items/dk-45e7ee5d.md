---
id: dk-45e7ee5d
type: task
created: 2026-10-31
status: todo
since: 2026-10-31
area:
priority: P2
rank: zzzzzzzzzzzzzn
parent:
fixes: []
blocked_by: []
relates: []
---
# Updates service: drop dead --smoke check and the 1 s block-reason poll


Source: structure review 2026-10-31 (abstraction lens).

- `src/main/services/updates/service.ts` checks `process.argv.includes('--smoke')`, but smoke never loads normal startup. The flag is also parsed in `index.ts` and `lifecycle/user-data.ts`.
- Block-reason changes are detected by a 1 s `setInterval` on `getUpdateState()` because live-meeting and post-processing have no change signal. `restart.ts` re-reads both guards, and the 'Updates are available in installed builds.' literal is repeated.

Direction: remove the dead check (or one `isSmokeRun()` in `lifecycle/`); add a small subscribe hook on the status modules, or one restart-gate module, and drop the poll; keep the message in one constant.
