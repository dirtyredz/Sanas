---
id: dk-bc3c35c4
type: task
created: 2026-10-31
status: done
since: 2026-11-09
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

Resolution (2026-11-09): lib/format/ done. The PresentationEditor part is stale: presentation was retired (docs/DECISIONS.md), so there is no presentation UI left to consolidate.
