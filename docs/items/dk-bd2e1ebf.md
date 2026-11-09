---
id: dk-bd2e1ebf
type: task
created: 2026-10-31
status: done
since: 2026-11-09
area:
priority: P3
rank: zzy
parent:
fixes: []
blocked_by: []
relates: []
---
# Relieve breadth in services/ and services/meetings/

Source: structure review 2026-10-31 (topology lens).

- `src/main/services/meetings/` had 13 children (9 folders plus loose `export.ts`, `remove.ts`, `index.ts`, `index.test.ts`).
- `src/main/services/` had 11 children, including a loose `transcript-format.ts` and single-file services.

Direction: move export/remove into a responsibility folder; group small services under a parent when the next one lands. Split downward, never sideways.

Done 2026-11-09: `meetings/` now groups `export.ts`/`remove.ts` under `records/` and `rediarize/`, `merge/`, `recovery/` under `postprocess/` (facades `index.ts` and `live-controls.ts` stay at the root); `services/` has 10 children (platform integrations grouped, `transcript-format.ts` under `turns/`). The remaining `assistant/` prompts/contracts grouping is tracked by dk-00f3ff65.
