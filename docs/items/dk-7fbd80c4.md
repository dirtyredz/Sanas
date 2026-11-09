---
id: dk-7fbd80c4
type: task
created: 2026-11-09
status: todo
since: 2026-11-09
area: rehearsal
priority: P2
rank: zzzzzzzzzzzzzzzzzzzzzzzt
parent:
fixes: []
blocked_by: []
relates: []
---
# Latency trial tools: share latency-summary rules; owner-run help and -DryRun

From the answer-latency round-3 sign-off (2026-11-09).

- scripts/rehearsal/trials/summarize.mjs keeps its own copy of the LatencyRecord stage-field list, its own (unrounded) median and its own 'delivered' rule, so it can disagree with the in-app summarizeLatency (latency-summary.ts). These numbers feed the endpoint and Full/Smart decisions. Direction: bundle the log parser over latency-summary.ts with esbuild the way compare.mjs does.
- scripts/rehearsal/trials/compare.ps1 and summarize.ps1 lack comment-based help (.SYNOPSIS, .PARAMETER, exit codes) and -DryRun. Direction: add the help block, and -DryRun at least on compare.ps1 since -RealProvider spends money.
