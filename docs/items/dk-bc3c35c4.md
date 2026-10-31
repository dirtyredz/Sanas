---
id: dk-bc3c35c4
type: task
created: 2026-10-31
status: todo
since: 2026-10-31
area:
priority: P3
rank: zzz
parent:
fixes: []
blocked_by: []
relates: []
---
# Group renderer lib/ helpers and give PresentationEditor one home


Source: structure review 2026-10-31 (topology lens).

`src/renderer/src/lib/` is a generic bucket with 8 loose code files beside 3 folders (`format-time`, `hotkey-label`, `speaker-label`, `ipc-error`, `icons`, `SummaryMarkdown`, `glossary-input`). Presentation UI is split across `lib/presentation/`, `app/jobs/PresentationEditor.tsx` (a single-file folder) and `lib/meeting/presentation-state`.

Direction: a responsibility folder such as `lib/format/` for the label and format helpers; one home for the presentation UI. Related: dk-240172e1 (glossary parser placement).
