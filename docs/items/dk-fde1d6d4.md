---
id: dk-fde1d6d4
type: task
created: 2026-11-02
status: todo
since: 2026-11-02
area: rehearsal
priority: P2
rank: zzzzzzzzzzzzzzy
parent:
fixes: []
blocked_by: []
relates: [dk-50c47b5d]
---
# Accept real devices and paid providers for live guided rehearsals

The live rehearsal feature is implemented without paid provider or microphone execution. Owner-only acceptance: run scripts/rehearsal/run.ps1 -Tier live -Scenario live-interview and live-client-qa with headphones; verify default-output TTS reaches actual loopback, owner mic stays channel 0, owner silence and skip/end controls, real screenshot capture on each intended display, adaptive follow-ups and saved normal summary/transcript/suggestions. Inspect each no-suggestion outcome and latency report. Free stubbed lifecycle, engine and scripted regressions do not establish device/voice/provider quality. No keys should be fetched by an implementation agent for this acceptance.
