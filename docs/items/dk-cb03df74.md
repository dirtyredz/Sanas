---
id: dk-cb03df74
type: task
created: 2026-11-09
status: todo
since: 2026-11-09
area: structure
priority: P2
rank: zzzzzzzzzzzzzzzzzzzzzzzz
parent:
fixes: []
blocked_by: []
relates: []
---
# Nest ipc/ feature pairs into subfolders (mock-interview, live-controls, screen-capture)

Push review 2026-11-09 (topology lens). src/main/ipc/ root holds 13 code files plus jobs/ (over the ~12 fan-out cap); audio-chunk.ts was just added. Feature pairs group cleanly: mock-interview.ts + mock-interview-validation.ts, live-controls.ts + live-controls-validation.ts, screen-capture.ts + screen-capture-validation.ts. Direction: nest each pair under ipc/<feature>/ like ipc/jobs/, with a STRUCTURE.md bullet each. Wide mechanical move: run alone.
