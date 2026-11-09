---
id: dk-61abdfa5
type: task
created: 2026-11-03
status: done
since: 2026-11-09
area: storage
priority: P3
rank: zzzzzzzzzzzz
parent:
fixes: []
blocked_by: []
relates: []
---
# One rule for 'profile used': drop the SQL trim in meetingColumns


Push sign-off 2026-11-03 (P2): meeting-columns.ts:21 trims 4 whitespace chars in SQL, while meeting-grounding.ts:25 uses !!interviewProfile. The write path already trims (context/profile.ts:7). Use interview_profile != '' with a comment pointing to interviewProfileSnapshot.
