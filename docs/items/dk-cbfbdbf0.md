---
id: dk-cbfbdbf0
type: task
created: 2026-11-09
status: todo
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

Push review 2026-11-09 (topology lens). Minor breadth / folder-per-file leftovers: src/main/system-audio.ts is a loose source at the src/main/ root (10 children); src/renderer/src/audio/ holds only mic.ts; src/main/db/ root has 9 loose files (backup, read-only, sqlite-time, fts-query, ...) plus 3 folders. Direction: system-audio.ts → services/platform/; fold audio/mic.ts under lib/ (or a capture home); group db/ root helpers under db/support/ if it grows further.
