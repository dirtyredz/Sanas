---
id: dk-fb79f58b
type: task
created: 2026-11-03
status: todo
since: 2026-11-03
area: structure
priority: P3
rank: zzzzzzzzzn
parent:
fixes: []
blocked_by: []
relates: []
---
# Extract useMeetingResumeDraft hook from LiveMeetingPage


Push review 2026-11-03 (componentization, P2): resume draft, import state and error, importResume handler and the validity check sit inline in the 398-line LiveMeetingPage, and the validity rule duplicates validateResume. Extract the hook into lib/meeting/resume/.
