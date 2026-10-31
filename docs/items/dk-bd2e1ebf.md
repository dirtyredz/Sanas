---
id: dk-bd2e1ebf
type: task
created: 2026-10-31
status: todo
since: 2026-10-31
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

- `src/main/services/meetings/` has 13 children (9 folders plus loose `export.ts`, `remove.ts`, `index.ts`, `index.test.ts`). `context/` holds a single `session.ts`.
- `src/main/services/` has 11 children, including a loose `transcript-format.ts` and single-file services `history/`, `audio-store/`, `retention/` and `hotkeys/`.

Direction: move export/remove into a responsibility folder; merge `context/` into `presentation/` or `assist/`; move `transcript-format.ts` beside its main consumer; group small services under a parent when the next one lands. Split downward, never sideways.
