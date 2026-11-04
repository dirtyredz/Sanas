---
id: dk-fa90ae92
type: task
created: 2026-11-04
status: todo
since: 2026-11-04
area: ci
priority: P2
rank: zzzzzzzzzzzzzzzzzzzz
parent:
fixes: []
blocked_by: []
relates: []
---
# Run the full typecheck before push (pre-push gate or fast gate), not only in release CI

v0.1.16 release CI failed on a test-only TS error (shown-ledger.test.ts used ManualKind 'screen'); vitest strips types and the pre-commit hook runs only prettier + oxlint, so it reached CI. Add npm run typecheck (tsconfig.node.json + tsconfig.web.json) to the pre-push hook or the documented per-slice fast gate so a type error is caught before push. Cheap guard for the escaped bug.
