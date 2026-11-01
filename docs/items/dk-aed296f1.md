---
id: dk-aed296f1
type: task
created: 2026-11-01
status: todo
since: 2026-11-01
area:
priority: P3
rank: zzzzz
parent:
fixes: []
blocked_by: []
relates: []
---
# Group lib/ loose files by responsibility and split lib/meeting/context


From the overlay redesign review (2026-11-01, topology lens).

- src/renderer/src/lib/ has 8 loose files plus 3 subfolders (11 entries) in a generic bucket; STRUCTURE.md calls it pure helpers but it holds components and hooks. Group e.g. lib/formatting/ (time, speaker, hotkey labels) and fix the bullet wording.
- src/renderer/src/lib/meeting/ has 11 code files mixing reducers, five hooks and MeetingContextEditor.tsx. Split lib/meeting/context/ (editor, draft, state, useMeetingContext*) from meeting/presentation state.
