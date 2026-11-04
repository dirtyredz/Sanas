---
id: dk-e0b6ed72
type: task
created: 2026-11-04
status: todo
since: 2026-11-04
area: mock-interview
priority: P3
rank: zzzzzzzzzzzzzn
parent:
fixes: []
blocked_by: []
relates: [dk-f9ab8645]
---
# AnswerWait.markPrompted: drop dead openedAt reset and fix its comment; extract engine say(text) shared by nudge and question speaking

From the v0.1.14 sign-off: (1) answer-wait.ts ~l.41 markPrompted resets openedAt but nothing reads it after prompted is set; the comment 'so a late answer is not instantly cut off' is wrong (heard refreshes lastActivity). (2) engine.ts ~l.111 nudge() duplicates the controller/state=speaking/speak/aborted steps of the question path; extract a private say(text).
