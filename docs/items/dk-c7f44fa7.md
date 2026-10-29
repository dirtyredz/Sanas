---
id: dk-c7f44fa7
type: feature
created: 2026-10-29
status: done
since: 2026-10-29
area: phase-3
priority: P2
rank: zzzzzzzzzzt
parent:
fixes: []
blocked_by: []
relates: []
---
# Add whisper answer modes and compact suggestions


Add configurable smart/full/points whisper behavior, enforce the compact headline/code/follow-up response contract, and render that safe subset in the overlay and meeting suggestion log.

Acceptance:
- Whisper mode persists with smart as the backward-compatible default and rejects invalid IPC values.
- Answer now is always full; ambient behavior follows the selected mode with appropriate token budgets.
- Prompts specify the compact contract and code limits.
- Overlay and meeting log render bold headlines, fenced code, and inline code without interpreting HTML.
- Settings, prompts, renderer, and validation have focused tests; living docs are current.
