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
remain for inspection. The wrapper uses existing environment credentials or fetches only missing
keys needed by the selected tier/assistant through the 1Password `op` CLI:
`op://Sanas/Sanas - Claude/credential` and `op://Sanas/Sanas - Deepgram/credential`.
Unlock/sign in to 1Password, enable CLI integration and approve Windows Hello when prompted.
Missing CLI or signed-out reads fail with a corrective message; secret values are never printed.
`-DryRun` describes needed reads without invoking `op`. Wrapper environment keys are cleared in
finally; Electron receives them only in main and clears them
from the isolated settings file during teardown. A forcibly killed run may retain those local
credentials: treat its profile as private. Provider output and transcript text are not logged.
Scripted/audio runs start no retention, updates, email, global shortcuts or microphone
capture. Live runs additionally enable the normal owner-started capture and three rehearsal controls.

## Live mock: hear, see and answer aloud

```powershell
& C:/Users/dirty/projects/.worktrees/sanas/rehearsal-harness/scripts/rehearsal/run.ps1 -Tier live -Scenario live-interview
# Shorter client delivery review:
& C:/Users/dirty/projects/.worktrees/sanas/rehearsal-harness/scripts/rehearsal/run.ps1 -Tier live -Scenario live-client-qa
# Free preflight from any directory; never fetches keys, builds, opens devices or speaks:
& C:/Users/dirty/projects/.worktrees/sanas/rehearsal-harness/scripts/rehearsal/run.ps1 -Tier live -Scenario live-interview -DryRun
```

Live implies visible windows and real Claude for both the interviewer and Sanas. Both missing
keys are fetched through the existing 1Password references above. No fake STT, replayed WAV,
injected audio or automatic screenshots are used. Do not pass `-Audio` or `-RealCapture`.

1. The console explains controls and counts down before opening an isolated app. The app
   checks that Windows exposes an input and output device, then shows setup instructions.
2. Open **Live**, select the rehearsal job, keep **This PC**, and click **Start**. This is the
   ordinary microphone + AudioWorklet + system-loopback capture, not a rehearsal capture path.
   You have five minutes to start. If loopback falls back to mono, the rehearsal refuses it;
   fix the device/permission issue and retry Start. No interviewer speaks before capture starts.
3. Three seconds after Start, offline Windows speech plays the first question through the
   default output. Deepgram hears it through real loopback; your real microphone is channel 0.
   Read Sanas's normal suggestions in the overlay and answer aloud. The interviewer only sees
   finalized conversation, never Sanas's suggestions. It waits for your final transcript and
   2.5 seconds without owner-channel activity, then follows up or asks the next planned question.
4. Screen topics open an existing fixture borderless across the target display. The overlay
   moves to that display; use its **Screen** control yourself. A share persists until replaced
   or dismissed. Screens are real desktop content, and screenshot acquisition stays production.
5. The plan finishes when its topics and follow-ups finish, or at its maximum duration.
   Stop or Pause on the normal Live page also ends the rehearsal. Summary and recording
   post-processing finish before windows close. The console prints `OK` or `FAILED` and report path.

| Control                         | Action                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| Ctrl+Alt+Right                  | Skip the current wait/speech, bypass follow-ups and advance to the next planned question |
| Ctrl+Alt+End                    | End the session and save the normal meeting record                                       |
| Ctrl+Alt+Backspace              | Dismiss the current share from anywhere                                                  |
| Escape with the fixture focused | Dismiss that share                                                                       |

If skip cancels generation before a planned question has begun, that still-unasked question
is retried. Controls must register successfully; a collision fails setup instead of leaving an
unstoppable session. Use the overlay's existing buttons for screenshots and requested answers;
ordinary application global hotkeys are not installed in this isolated rehearsal.

**Headphones recommended.** Digital loopback hears the interviewer with speakers OR headphones.
The existing microphone path explicitly disables software echo cancellation; channel separation
does not erase acoustic speaker bleed. Speakers can therefore duplicate interviewer speech on
the owner channel and trigger premature turn-taking. Headphones avoid that. Close unrelated
audio playback because loopback captures it too. No production audio policy is changed here.

`live-interview` covers behavioural and technical questions plus architecture, boundary,
duplicate-search and SQL fixtures (15-minute maximum). `live-client-qa` covers delivery,
scope, risk, architecture and next actions (10-minute maximum). Allow build/startup and up to
three minutes for post-processing in addition. These are maximums, not forced-length scripts.
Provider charges include two-channel streaming, recorded-audio batch transcription, Sanas
classifier/suggestions/summary, and one short interviewer call per turn. Windows TTS is offline.
For planning, reserve a few dollars per 10–15-minute rehearsal; this is an unmeasured allowance,
not a verified tariff or cap. Actual model, answer length and retries determine the charge.

Live plans are version-1 JSON with `mode: "live"`, `name`, `persona`, `durationMs` (10 seconds
to one hour), optional `silenceMs` (default 2500, range 500–15000), optional numeric `displayId`
(primary by default), and ordered `topics`. Each topic has a unique `id`, a verbatim fallback
`question`, `maxFollowUps` (0–5), and optional `screen` path relative to the plan. Copy a plan
to customize timing/persona/questions. The engine, not Claude, owns ordering and follow-up caps.
Interviewer failure, deadline or invalid output advances with the next question verbatim.

The live JSON report includes every spoken interviewer turn, fallback status, recognized
loopback audio spans, suggestion delivery, word counts, and correlated classifier/turn/request
outcomes for missing suggestions. Latencies are relative to the last received loopback final;
first-visible means the first main-to-renderer output broadcast, not a measured compositor paint.
Absent loopback finals are reported explicitly and never inferred from TTS playback. Manual
screen requests remain in the report's complete request list; they are not guessed into an
automatic question correlation. No content rubric passes/fails unscripted answers.

The normal finals, suggestions, summary and WAV stay in the reported isolated `profile` directory.
Normal summary eligibility still applies (at least five final lines); ending very early can
legitimately leave `summarySaved: false` in the report.
The live report includes the interviewer's spoken text, but not the owner's answer text or Sanas's
answer text; those remain in the private meeting record. To inspect it later without starting a
new live run, use the built Electron executable with `out/main/index.js` and
`--dev-user-data=<absolute reported profile path>` (normal library UI, cleared keys).
Do not point that option at the owner's real profile. Paid audio/device acceptance is owner-only;
the free tests use a stub interviewer and simulated finals, without microphone access.

## Starters and owner-only legs

- `client-checkin`: ambient answer, finals-only storage, screenshot delivery, silent-channel
  warning, reconnect, missing display, More detail, summary and batch replacement.
- `presentation`: Next point coaching, slide navigation, answer mode, screen and capture timeout.
- `standup`: slow/failing assistant, busy admission, screenshot and oversize encoding failure.
- `mock-interview`: behavioural, technical and follow-up questions with automatic suggestions,
  a shared architecture diagram (screen step), a socket drop and reconnect, summary saved.
- `coding-interview`: three locally rendered code screens (loop boundary, quadratic duplicate
  search, SQL NULL comparison), a screenshot-dependent follow-up and a two-part complexity/
  improvement question. Regenerate PNGs with `scripts/rehearsal/render-coding-fixtures.ps1`.
  Delivery checks apply to both assistants; concept checks apply only to Claude.
- `rapid-qa`: two bursts of short stakeholder questions plus an explicit typed ask. These short
  gaps exercise merged-turn assembly. Distinct completed-turn carry during a busy lane is tested
  separately in `live-assistance.test.ts` (including the actual outgoing question block).
  `request` checks establish coverage; Claude answer rubrics independently check each topic.
  Canned `Covers:` text is a plumbing oracle only. Mock interview checks its final pair the same way.

The checked-in PNGs are locally rendered client dashboards, slides and an architecture diagram. A scripted screen source
deliberately puts a wrong display first so display-ID matching remains exercised.

```powershell
# Offline speech only; no provider charges. Increase utterance durations if TTS does not fit.
./scripts/rehearsal/render-audio.ps1 -Scenario scripts/rehearsal/scenarios/standup.json -Output .tmp/standup.wav
# Paid: missing DEEPGRAM_API_KEY comes from 1Password. Assistant remains free.
./scripts/rehearsal/run.ps1 -Scenario standup -Tier audio -Assistant canned -Audio .tmp/standup.wav -Visible
# Omit -Audio to synthesize offline first, or pass an existing Sanas recording.
./scripts/rehearsal/run.ps1 -Scenario standup -Tier audio -Audio C:/recordings/client.wav
# Paid Claude: missing ANTHROPIC_API_KEY comes from 1Password (optional ANTHROPIC_WORKSPACE_ID).
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
pixels across the fixture content and under the overlay against `capturePage` of the fixture. Both
must match within a mean RGB error of 12/255. This detects wrong displays, black captures and
visible overlay contamination; it is not pixel-perfect colour calibration. Keep that display
unobscured and unlocked: the screen will show fixtures. The fixture is raised above ordinary
windows, below the protected overlay. Actual content bounds are mapped from DIP into the capture
thumbnail once; the taskbar is outside the content oracle. Obstruction/content mismatch and
overlay mismatch have distinct report reasons. The fixture closes and overlay bounds restore
on cleanup. Other Electron/build processes must finish first; the wrapper waits up
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

Expectations: `request`, `suggestion`, `coach`, `screen`, `no-interims`, `summary`, `capture-warning`,
`reconnect`, `busy`, `assistant-error`, `capture-error`, `slide`, `recording`, `batch`.
`after` anchors to actual step invocation; `fromFinal: true` anchors utterances to the received
final (declared end only as fallback). `withinMs` limits completed delivery, and
`contains` matches case-insensitive output (summary, answer or capture error). Missing evidence
fails; there are no implicit skips. Screenshot success requires identical encoded bytes at the
assistant and a matching answer, plus pixel validation for real captures. `no-interims` compares
live DB rows with final events before batch replacement can conceal a storage regression.
`covers: [stepId, ...]` requires the same outgoing request to cover those steps; automatic
coverage uses focused turn spans, not all words in the rolling transcript. Manual actions have
isolated action IDs even across asynchronous capture. Use `rubric` for bounded concept matching
(quadratic notation, empty-array facts, SQL NULL, or individual stakeholder topics). These are
lexical checks, not proof of correctness; inspect saved answers for grounding and code quality.

Reports retain request/suggestion IDs, turn spans and step associations, dispatch/first provider
delta/first visible output/completion/delivery times, pending-at-stop state, classifier verdicts,
admissions and invalidation/expiry/suspension transitions. They omit prompts, answers, keys and
image bytes; captures retain SHA-256 digests and pixel errors. Successful full prompts/answers
remain in the private isolated SQLite profile. Failed/no-op calls retain metadata only.
Treat retained profiles and custom scenario text as private and remove them when no longer needed.

Checks distinguish never-requested, declined, failed/cancelled, pending-at-stop, delivered-late
and wrong-content/undelivered. Compare `requests`, `transitions`, `admissions`, `finalReceipts`
and `turnCompletions` to locate a lost answer. Request coverage is not answer acceptance.
`responsivenessMs` reports a separate `responsive` result (5 seconds in the interview starters),
not a completion deadline or a measured SLO. First-visible, completion, onset and completed-turn
latencies are individual samples; do not infer percentiles from one run. Initial answers target
80 prose words excluding code; reports include word counts. More detail is intentionally expanded.
Coding follow-up checks separately cover an automatic spoken request, an explicit typed question
with a fresh screenshot, and source-only More detail; detail never acquires later transcript.

Offline rendering writes `<output>.timings.json` with every clip's measured duration, slot,
overrun and recommended slot (speech + 250 ms, rounded up to 100 ms). It reports all overrun
slots before failing and never truncates speech. Mock/rapid slots use that margin, short burst
gaps, and silence before user replies/Stop; pressure/cancellation behavior remains in unit tests.

## Watch the mock interview

From any PowerShell directory, including `C:\Windows`:

```powershell
& C:/Users/dirty/projects/.worktrees/sanas/rehearsal-harness/scripts/rehearsal/run.ps1 -Scenario mock-interview -Tier scripted -Assistant claude -Visible
& C:/Users/dirty/projects/.worktrees/sanas/rehearsal-harness/scripts/rehearsal/run.ps1 -Scenario mock-interview -Tier audio -Assistant claude -Visible
```

The first plays scripted transcript events with real Claude; the second synthesizes offline
speech and sends replay audio through Deepgram streaming and batch. `-Visible` watches the
overlay; add `-RealCapture` only to exercise the physical desktop with visible fixtures.
The scenario lasts 182.4 seconds; allow roughly 4–6 minutes including local build and final
processing, plus any 1Password prompt or machine wait. Budget roughly $0.10–$1 for Claude
and a few additional cents for streaming plus batch audio, depending on configured models,
tokens, retries and provider pricing. These are planning estimates, not measured charges.
Real credential fetch and paid acceptance are owner checks; canned success does not close them.

An expectation may declare `assistant: "claude"` or `assistant: "canned"`. Only expectations
for the selected assistant are evaluated; omitted means both. Use this for model-specific
content checks, retaining unconditional delivery checks so canned runs still test plumbing.

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
