---
id: dk-8cd1d91d
type: bug
created: 2026-11-02
status: done
since: 2026-11-02
area: rehearsal
priority: P2
rank: zzzzzzzzzzzzzzt
parent:
fixes: []
blocked_by: []
relates: []
---
# Interview and rapid-QA speech exceeds scenario timing

The documented automatic offline-TTS audio path fails before provider execution for two existing scenarios on this Windows machine (2026-11-02). Running render-audio.ps1 with mock-interview.json exits 1: Speech exceeds duration for step intro-q; enlarge duration and move following steps. rapid-qa.json exits 1: Speech exceeds duration for step b1q1; enlarge duration and move following steps.

Evidence: .tmp/owner-runs/rehearsal-audio-20261102-085917-5504.log and .tmp/owner-runs/rehearsal-audio-20261102-085944-31488.log in the rehearsal-harness worktree. coding-interview.json renders successfully with the same script and voice setup.

Adjust utterance slots and following steps to fit the offline voice while preserving stacked-question intent and realistic expectation deadlines. Verify both offline renders, then run the approved audio acceptance when credentials are available. No product failure is established by these synthesis errors.

2026-11-02 implementation verified: mock-interview and rapid-qa were retimed from measured offline speech with a 250 ms margin rounded to 100 ms. render-audio.ps1 now records every clip and all overrun slots in a timings sidecar. .tmp/fix-mock.wav.timings.json (11 clips) and .tmp/fix-rapid.wav.timings.json (8 clips) both report zero overruns. Scripted activity now advances throughout long utterances so the silence fallback does not split bursts prematurely. Both canned scenarios pass all 12 checks. Paid acceptance remains in dk-e18464e7.
