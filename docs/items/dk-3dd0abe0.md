---
id: dk-3dd0abe0
type: task
created: 2026-11-06
status: done
since: 2026-11-09
area: structure
priority: P2
rank: zzzzzzzzzzzzzzzzzzzzzzt
parent:
fixes: []
blocked_by: []
relates: [dk-18d2c532]
---
# One application-stage capability policy (create/refresh/archive/visibility) for job import


From the closed-unlinked-hide pre-push review (abstraction lens, 2026-11-06).

Closed-stage rules are repeated as concrete checks in `src/main/services/jobs/applications/import/listing.ts`, `import/preview.ts`, `import/apply.ts` and `merge-preview.ts` (linkedStatus). Changing what a closed application allows needs synchronized edits across flows.

Direction: one pure stage-capability policy (create, refresh, archive, visible) used by listing, preview and apply; merge-preview keeps only the three-way comparison. Relates to dk-18d2c532 (move linkedStatus to listing).

Also from sign-off: `import/listing.ts` `summarize()` now both filters (null for unlinked closed) and builds the row; make visibility an explicit `visible` capability checked in `listApplications`. The dev mock `src/renderer/src/dev/mock-jobs.ts` copies the closed rules by hand (closedActive, closed-create rejection); include it in the change.
