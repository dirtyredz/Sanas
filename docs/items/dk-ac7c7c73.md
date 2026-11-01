---
id: dk-ac7c7c73
type: task
created: 2026-11-01
status: todo
since: 2026-11-01
area:
priority: P3
rank: zzzzzt
parent:
fixes: []
blocked_by: []
relates: []
---
# Extract AnswerActions and WorkspacePanel from the overlay answer and workspaces files


From the overlay redesign review (2026-11-01, componentization lens).

- overlay-app/suggestions/OverlaySuggestions.tsx (168 lines) also owns history navigation, More detail and Back to source, gated by a mode flag. Extract AnswerActions.tsx.
- overlay-app/workspaces/OverlayWorkspaces.tsx holds the generic WorkspacePanel frame, the Empty helper and all workspace wiring, and takes the whole OverlaySessionModel (type-level shell/<->workspaces/ cycle). Move WorkspacePanel/Empty to their own file and pass each panel only the slices it uses.
- Context conflict/notice/Apply/Reload UI is duplicated between MeetingContextEditor and OverlayContext; extract only the status part if the main editor gains an unsaved indicator or conflict copy changes.
