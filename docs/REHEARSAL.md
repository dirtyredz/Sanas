# Meeting rehearsals

Run from any directory (use the absolute script path when outside the repo):

```powershell
& C:/Users/dirty/projects/.worktrees/sanas/rehearsal-harness/scripts/rehearsal/run.ps1 -Scenario client-checkin -Tier scripted -Assistant canned
```

The wrapper builds locally, starts Electron in explicit `--rehearsal` mode, and prints a
PASS/FAIL line per expectation plus `OK (exit 0) log: ...` or `FAILED (exit 1) log: ...`.
It does not download dependencies. `-DryRun` checks paths without building or calling providers.
`-Visible` opens the production overlay; the default has no windows. Scenarios use real jobs,
meeting lifecycle, turn assembly, classifier/coach policies, manual admission, SQLite, WAV
recording and on-stop summary/batch replacement. Canned replies prove plumbing, not model quality.

Each run creates `.tmp/rehearsal/run-*/profile` before settings or DB initialization. No
owner profile is read. Reports/logs live under `.tmp/owner-runs/`; the profile and recording
remain for inspection. Credentials are read only from the main-process environment and cleared
from the isolated settings file during teardown. A forcibly killed run may retain those local
credentials: treat its profile as private. Provider output and transcript text are not logged.
No retention, updates, email, global shortcuts or microphone capture are started.

## Starters and owner-only legs

- `client-checkin`: ambient answer, finals-only storage, screenshot delivery, silent-channel
  warning, reconnect, missing display, More detail, summary and batch replacement.
- `presentation`: Next point coaching, slide navigation, answer mode, screen and capture timeout.
- `standup`: slow/failing assistant, busy admission, screenshot and oversize encoding failure.
- `mock-interview`: behavioural, technical and follow-up questions with automatic suggestions,
  a shared architecture diagram (screen step), a socket drop and reconnect, summary saved.
- `rapid-qa`: two bursts of short stakeholder questions plus an explicit Answer-now ask. The
  ambient lane is newest-only by design (earlier questions in a burst are superseded), so the
  scenario expects the latest question of each burst and the explicit ask to be answered.

The checked-in PNGs are locally rendered client dashboards, slides and an architecture diagram. A scripted screen source
deliberately puts a wrong display first so display-ID matching remains exercised.

```powershell
# Offline speech only; no provider charges. Increase utterance durations if TTS does not fit.
./scripts/rehearsal/render-audio.ps1 -Scenario scripts/rehearsal/scenarios/standup.json -Output .tmp/standup.wav
# Paid: set DEEPGRAM_API_KEY in this shell. Assistant remains free.
./scripts/rehearsal/run.ps1 -Scenario standup -Tier audio -Assistant canned -Audio .tmp/standup.wav -Visible
# Omit -Audio to synthesize offline first, or pass an existing Sanas recording.
./scripts/rehearsal/run.ps1 -Scenario standup -Tier audio -Audio C:/recordings/client.wav
# Paid Claude: also set ANTHROPIC_API_KEY (optional ANTHROPIC_WORKSPACE_ID).
./scripts/rehearsal/run.ps1 -Scenario client-checkin -Assistant claude -Visible
# Real desktop; does not incur provider charges with scripted+canned.
./scripts/rehearsal/run.ps1 -Scenario client-checkin -RealCapture -Visible
```

The audio tier accepts RIFF WAV linear16 at 16 kHz, mono or interleaved stereo. Stereo is
Me on channel 0, Them on channel 1. Mono preserves production unknown identity (no invented
Me pin). Replay is paced through the same main audio-frame ingress as capture, including
health checks and recording, then real Deepgram batch re-diarization. Existing WAV content
must match the scenario's expectations and timeline; utterance steps are not synthesized as
transcripts in this tier. Silent-channel faults actually erase channel 1, so speech and summary
expectations may fail when too much evidence is lost. Paid model/STT output is nondeterministic;
choose content checks and deadlines accordingly. Paid legs were not run by the implementer.

Real capture opens a borderless fixture on the primary display (or the step's `displayId`),
positions the protected Sanas overlay there, and uses `desktopCapturer`. It compares downsampled
pixels across the display and under the overlay against `capturePage` of the fixture. Both
must match within a mean RGB error of 12/255. This detects wrong displays, black captures and
visible overlay contamination; it is not pixel-perfect colour calibration. Keep that display
unobscured and unlocked. Other Electron/build processes must finish first; the wrapper waits up
to 45 minutes without terminating them. All windows it creates close on exit.

## Author a scenario

Version 1 is plain JSON. Paths resolve relative to the scenario file. All timing is integer
milliseconds, bounded to ten minutes; steps are ordered and have unique IDs. Example:

```json
{
  "version": 1,
  "name": "Client rollout",
  "durationMs": 5000,
  "steps": [
    {
      "id": "question",
      "atMs": 0,
      "kind": "utterance",
      "channel": "them",
      "speaker": 1,
      "text": "What is the rollout date?",
      "durationMs": 2500
    },
    { "id": "screen", "atMs": 3500, "kind": "screen", "image": "../fixtures/dashboard.png" }
  ],
  "expectations": [
    { "id": "answer", "kind": "suggestion", "after": "question", "withinMs": 3500 },
    {
      "id": "image",
      "kind": "screen",
      "after": "screen",
      "withinMs": 1500,
      "contains": "dashboard"
    },
    { "id": "finals", "kind": "no-interims" }
  ]
}
```

Steps: `utterance` above; `screen` (`image`, optional `real`, `displayId`); `ask` (`text`);
`detail` (latest eligible completed answer); `answer-mode` (`enabled`); `slide`
(`direction`: `prev`/`next`); `fault` (`fault`, `durationMs`). Fault names:
`socket-drop`, `silent-them`, `assistant-slow`, `assistant-fail`, `capture-timeout`,
`missing-display`, `oversize-image`. Screen faults apply to the next capture while active;
assistant faults apply to calls while active. Scripted drops emit reset and discard unfinished
speech; audio drops close the actual socket abnormally and let Deepgram's own backoff reconnect.

Expectations: `suggestion`, `coach`, `screen`, `no-interims`, `summary`, `capture-warning`,
`reconnect`, `busy`, `assistant-error`, `capture-error`, `slide`, `recording`, `batch`.
`after` anchors to actual step invocation, `withinMs` limits observed receipt time, and
`contains` matches case-insensitive output (summary, answer or capture error). Missing evidence
fails; there are no implicit skips. Screenshot success requires identical encoded bytes at the
assistant and a matching answer, plus pixel validation for real captures. `no-interims` compares
live DB rows with final events before batch replacement can conceal a storage regression.

Optional top-level `coach: true`, `slides` (production Slide fields: title, talkingPoint,
script, keyFacts) and `audio` (WAV path) enable those legs. Summaries require at least five live
finals. Leave time for turn grace, assistant completion, and faults; an acquisition timeout
alone needs five seconds. Canned summaries echo the received transcript section so content checks
test prompt delivery and persistence, not summarization quality.

## Fast verification

```powershell
npm run typecheck
npm run lint
npm exec -- vitest run src/main/rehearsal scripts/rehearsal/runner.test.ts src/main/services/stt src/main/services/screen-capture src/main/services/meetings/assist/live-session.test.ts src/main/services/meetings/summary/summarize.test.ts src/main/lifecycle/user-data.test.ts
./scripts/rehearsal/run.ps1 -Scenario client-checkin -Tier scripted -Assistant canned
```

The last command includes the required local build. Do not add full tiers, packaged smokes or
paid provider runs to this gate. Unit tests mock Electron and cover real-capture/audio seams.
