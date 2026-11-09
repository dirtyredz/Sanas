---
id: dk-f7c35aab
type: task
created: 2026-11-09
status: todo
since: 2026-11-09
area: assist
priority: P2
rank: zzzzzzzzzzzzzzzzzzzzzzzn
parent:
fixes: []
blocked_by: []
relates: []
---
# Visibility evidence: ipc handler delegates, one state const, profile projection out of runner

From the answer-latency round-3 sign-off (2026-11-09).

- src/main/ipc/live-controls.ts SuggestionVisibility handler decides the hidden override and publishes onto the runner's observation bus via observeRun; ipc/ should validate and delegate. Direction: acknowledgeVisibility(value, windowVisible) beside run-observation.ts (or on the meetings/live-controls facade); handler passes only the window fact.
- The state union 'frame-after-commit'|'hidden'|'unselected' is re-spelled in run-observation.ts, latency.ts and live-controls-validation.ts. Direction: export SUGGESTION_VISIBILITY_STATES + type from src/shared/live-controls/visibility.ts and use it in all four places.
- src/main/services/meetings/assist/suggestion-runner.ts:150-160 holds the effective-profile projection and model-name redaction regex. Direction: move into effectiveProfile(req) in run-observation.ts.
