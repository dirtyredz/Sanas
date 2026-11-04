---
id: dk-b56bcf19
type: task
created: 2026-11-04
status: todo
since: 2026-11-04
area: assistant
priority: P3
rank: zzzzzzzzzzzzzy
parent:
fixes: []
blocked_by: []
relates: []
---
# Coach question type as Pick<LatestQuestion>; rename coach QUESTION_CHARS; place ShownLedger beside per-meeting memories

From the v0.1.16 sign-off: (1) coach-prompts.ts:37 CoachPromptInput.question restates {speaker,text,startMs} instead of Pick<LatestQuestion,...>, and its QUESTION_CHARS (1000) shares a name with anchor.ts QUESTION_CHARS (4000); rename to COACH_QUESTION_CHARS. (2) answer-context/shown-ledger.ts also holds coach memories (recent, coachRecent); when assistant/ is regrouped, move it beside per-meeting memories or widen answer-context's declared responsibility in STRUCTURE.md.
