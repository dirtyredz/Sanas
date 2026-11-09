---
id: dk-8a97cca1
type: task
created: 2026-11-03
status: done
since: 2026-11-09
area: structure
priority: P3
rank: zzzzzzzzzw
parent:
fixes: []
blocked_by: []
relates: []
---
# Normalize assistant provider failures at the AssistantProvider seam


Push review 2026-11-03 (abstraction, P2): failure-diagnostics.ts and classifier.ts duck-type Anthropic SDK error shapes outside claude.ts, and classifier.ts:150 compares req.model to req.apiKey. Have the provider normalize to {category,status?,requestId?}; failureDiagnostic only allowlists and bounds; drop the apiKey comparison.
