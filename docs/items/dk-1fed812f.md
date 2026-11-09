---
id: dk-1fed812f
type: task
created: 2026-11-03
status: done
since: 2026-11-09
area: storage
priority: P3
rank: zzzzzzzzzzzzn
parent:
fixes: []
blocked_by: []
relates: []
---
# Colocate MeetingRow/toMeeting with meetingColumns


Push sign-off 2026-11-03 (P2): the projection is in meeting-columns.ts, but MeetingRow/toMeeting are in meetings.ts, and every result is cast `as MeetingRow`, so drift between the two compiles silently. Move them together (fits dk-db6d448c).
