---
id: dk-b6fd864b
type: task
created: 2026-11-01
status: todo
since: 2026-11-01
area:
priority: P3
rank: zzzzzz
parent:
fixes: []
blocked_by: []
relates: [dk-0e676283]
---
# Unify the overlay switch with the library Switch control

From the main-window face-lift (2026-11-01). The library now has app/controls/Switch.tsx (.switch in styles/controls.css, 36x20 track). The overlay still draws its own .ov-switch (overlay-controls.css, 28x16) with the same checkbox-as-switch markup inline in AnswerEveryQuestion.tsx. Give Switch a compact size and use it in the overlay, then delete .ov-switch. Acceptance: one switch component and one set of switch styles; overlay preview scenarios unchanged visually.
