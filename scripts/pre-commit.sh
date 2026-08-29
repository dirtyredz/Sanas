#!/bin/sh
# Style gate for commits: format + lint whatever is STAGED, then let the commit proceed.
# Installed into .git/hooks/pre-commit by scripts/install-git-hooks.mjs (run via `npm run prepare`).
#
# Deliberately NOT husky: husky sets core.hooksPath=.husky, and git then ignores .git/hooks entirely —
# which would silently disable the structure-review pre-push gate that also lives there.
#
# lint-staged (not a hand-rolled loop) because it handles partially-staged files correctly: formatting
# a file with both staged and unstaged hunks would otherwise sweep the unstaged ones into the commit.
exec npx --no-install lint-staged
