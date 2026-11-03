---
id: dk-aabc1757
type: bug
created: 2026-11-03
status: done
since: 2026-11-03
area:
priority: P1
rank: zw
parent:
fixes: []
blocked_by: []
relates: []
---
# Repair recruiter-call suggestion context and answer quality

Implement recruiter-call repair per owner brief: explicit per-meeting deck opt-in (default off), safe job selection and historical filing, grounded live missing-fact replies, proportional initial answer depth, sanitized classifier diagnostics and actionable capture warnings. Preserve identity rules. Add native SQLite re-diarization rollback regression coverage.

Verified typecheck, lint, 141 tests in 23 touched-area files, and formatting. Deferred source provenance to dk-b7dedbdd and phone-on-speaker support to dk-9365cb25. Model quality, real-device routing and Electron ABI checks remain owner acceptance, not established by these deterministic tests. Evidence is retained in .tmp/handoff.md and .tmp logs.
