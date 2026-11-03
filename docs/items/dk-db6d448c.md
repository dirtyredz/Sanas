---
id: dk-db6d448c
type: task
created: 2026-11-03
status: todo
since: 2026-11-03
area: structure
priority: P3
rank: zzzzzzzzzzzy
parent:
fixes: []
blocked_by: []
relates: []
---
# Nest Start-time grounding under meetings/context/grounding/


Push sign-off 2026-11-03 (P2): `meetings/context/` mixes live context revisions (`session.ts`) with Start-time candidate grounding (start-request, profile, candidate-data, meeting-facts, meeting-keyterms, resume/). Nest the grounding half as `context/grounding/`, with `resume/` under it. Related: dk-bd2e1ebf.
