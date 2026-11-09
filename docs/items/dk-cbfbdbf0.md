---
id: dk-cbfbdbf0
type: task
created: 2026-11-09
status: done
since: 2026-11-09
area: structure
priority: P3
rank: zzzzzzzzzzzzzzzn
parent:
fixes: []
blocked_by: []
relates: []
---
# Small breadth leftovers: system-audio.ts, renderer audio/, db/ root helpers

Push review 2026-11-09 (topology lens). Minor breadth / folder-per-file leftovers.

Done (2026-11-09): `src/main/system-audio.ts` moved to `src/main/services/platform/system-audio.ts`; `src/main/` now holds only the process entry.

Closed without change: `src/renderer/src/audio/` no longer holds only `mic.ts` (it also has `capture-clock.ts` and its tests), so the folder-per-file premise is gone. `src/main/db/` root is ~13 loose files counting tests (backup, fts-query, integrity, read-only, sqlite-time, index); regroup under `db/support/` only if it grows again, since every move touches many importers.
