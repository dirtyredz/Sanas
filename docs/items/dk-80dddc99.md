---
id: dk-80dddc99
type: task
created: 2026-11-04
status: todo
since: 2026-11-04
area: structure
priority: P3
rank: zzzzzzzzzzzzzt
parent:
fixes: []
blocked_by: []
relates: []
---
# v0.1.15 placement tidy-ups: lib/meeting/resume single-file folder, repos/job vs jobs.ts, STRUCTURE tree ipc/job-resume

From the v0.1.15 push review (topology + componentization): (1) lib/meeting/resume/ holds only useJobHasResume.ts: move it up beside job-choices.ts/start-selection.ts or start a lib/meeting/job/ grouping. (2) db/repos/jobs.ts sits beside db/repos/job/ (one-letter difference): rename the folder for its responsibility or move jobs.ts in. (3) STRUCTURE.md tree: add ipc/job-resume/ as a child node. (4) ResumeDraftEditor.tsx has one caller (JobResume); fold in if no second caller appears.
