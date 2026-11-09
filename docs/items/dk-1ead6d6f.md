---
id: dk-1ead6d6f
type: task
created: 2026-11-03
status: done
since: 2026-11-09
area: assistant
priority: P2
rank: zzzzzzzzzzzzzzzzzy
parent:
fixes: []
blocked_by: []
relates: []
---
# Classify provider SDK errors at the provider seam, not in failure-diagnostics

From the c18ff23 push review (abstraction lens): failure-diagnostics.ts matches Anthropic SDK class names (APIConnectionError, APIConnectionTimeoutError) to pick the connection/timeout categories, and errorName is a vendor class name. A second AssistantProvider's transport errors would land in 'provider'. Direction: claude.ts maps SDK errors to a neutral category (or a typed ProviderError {category}) at the seam; failure-diagnostics only sanitizes.
