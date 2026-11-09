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

Done: AnswerActions extracted; WorkspacePanel/Empty in their own file and OverlayWorkspaces takes explicit slices.

Remaining (conditional): Context conflict/notice/Apply/Reload UI is duplicated between MeetingContextEditor and OverlayContext; extract only the status part if the main editor gains an unsaved indicator or conflict copy changes.
