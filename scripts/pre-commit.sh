#!/bin/sh
# Gate for commits, installed into .git/hooks/pre-commit by scripts/install-git-hooks.mjs (run via `npm run prepare`):
#   1. format + lint whatever is STAGED (lint-staged);
#   2. when any TypeScript is staged, the FULL typecheck (`npm run typecheck`, both tsconfigs).
#
# Why the typecheck is here and not in pre-push: vitest strips types, so a type error in a test file passes every
# test and lint, and reached release CI once (v0.1.16). The pre-push hook belongs to the global structure gate
# (installed per clone, not ours), so the cheapest checked-in place that runs before a push is the commit.
# Set SANAS_SKIP_TYPECHECK=1 to skip step 2 for a WIP commit; `npm run gate` runs the same checks on demand.
#
# Deliberately NOT husky: husky sets core.hooksPath=.husky, and git then ignores .git/hooks entirely —
# which would silently disable the structure-review pre-push gate that also lives there.
#
# lint-staged (not a hand-rolled loop) because it handles partially-staged files correctly: formatting
# a file with both staged and unstaged hunks would otherwise sweep the unstaged ones into the commit.
npx --no-install lint-staged || exit $?

if [ -z "$SANAS_SKIP_TYPECHECK" ] && git diff --cached --name-only --diff-filter=ACMR | grep -Eq '\.(ts|tsx)$'; then
  npm run --silent typecheck
fi
