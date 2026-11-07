---
id: dk-3de6a0e0
type: task
created: 2026-11-06
status: todo
since: 2026-11-06
area: structure
priority: P3
rank: zzzzzzzzzzzzzzy
parent:
fixes: []
blocked_by: []
relates: []
---
# Group job resume files into app/jobs/resume/ before the next jobs/ file lands


From the job import/delete pre-push review (topology lens, 2026-11-06).

`src/renderer/src/app/jobs/` is at the 10-entry breadth limit. `JobResume`, `ResumeDraftEditor`, `resume-draft` are the natural group.

Direction: move them into `app/jobs/resume/` when the next job-tab file is added.
