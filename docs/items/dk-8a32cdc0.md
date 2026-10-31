---
id: dk-8a32cdc0
type: task
created: 2026-10-29
status: todo
since: 2026-10-29
area: assistant
priority: P3
rank: zzw
parent:
fixes: []
blocked_by: []
relates: []
---
# Give AssistSettings one credentials/readiness accessor instead of Anthropic fields in the coordinator

From the 2026-10-29 structure review (abstraction P2). meetings/assist/live-assistance.ts and suggestion-requests.ts test s.anthropicApiKey and carry workspaceId/effort/model through; the has-credentials check is repeated in tryClassify, evaluateCoach and the runner (!req.apiKey). Direction: AssistSettings exposes assistReady (or a credentials accessor) so a second provider changes AssistSettings, not the coordinator; record the widened Anthropic-shaped debt in STRUCTURE.md Structural debt.
