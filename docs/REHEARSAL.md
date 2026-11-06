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
capture. Live practice now belongs to the normal app, described below.

## In-app mock interview (replaces the live tier)

The `-Tier live` CLI path is retired and exits with a pointer to **Mock interview** before
building, fetching credentials or opening devices. The engine/plans moved to the product
service; scripted/audio fixtures and gates remain the automated harness.

To try this branch, close other Sanas instances, open a real terminal in the worktree and run
`npm run dev`. This is a development build, not an installed release. Dev uses the same normal
userData and saved keys as installed Sanas; v8 migration uses the normal backup mechanism.
Do not subsequently launch an older schema build against the upgraded profile.

1. Open **Mock interview**. Add missing Claude/Deepgram keys in Settings if prompted.
2. Choose Job interview or Client Q&A and the job whose context should ground Sanas.
3. Use headphones and press Start. Real mic + system audio start automatically; mono fallback
   is refused. A separate interviewer window opens, speaks a question and shows its caption.
4. Answer aloud and pause. Once you have started speaking, 4 seconds without candidate speech allow a follow-up
   or next topic. The interviewer never sees Sanas's suggestions. Invalid/failed generation
   uses the next planned question. Use the overlay for suggestions and real Screen capture;
   position the overlay on the same display as the interviewer for screen questions.
5. End, close the interviewer, or let the plan finish. Results and full records appear in
   the tab's past practice sessions. Normal summary eligibility (five final lines) still applies.

Controls: Skip / Ctrl+Alt+Right; End / Ctrl+Alt+End; Dismiss share / Ctrl+Alt+Backspace;
Escape dismisses with the interviewer focused. These three globals exist only during a mock.
Skip during generation retries the still-unasked planned question; during speech/wait it
advances. Stopping/pausing the meeting or losing the library renderer also ends the mock.

Only local speechSynthesis voices are allowed; failure to find/play one ends setup/session.
Windows output, loopback, physical screen quality and paid-provider behavior must be accepted
by the owner in `dk-fde1d6d4`. No implementation agent should fetch keys or start a real mic
session. Results use recognized audio spans and main broadcast timestamps, not rendered paint.
Screen/manual requests are not guessed into automatic question correlations. Practice uses
normal provider billing; canned success proves wiring, not provider quality.

## Starters and owner-only legs

- `client-checkin`: ambient answer, finals-only storage, screenshot delivery, silent-channel
  warning, reconnect, missing display, More detail, summary and batch replacement.
- `meeting-context`: Start with a `meetingContext` agenda; checks it reaches answer and Next point
  requests (`context`, `context-coach`), plus coaching, answer mode, screen and capture timeout.
  Canned runs prove delivery, not model quality.
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

Interview/dashboard PNGs live only in `src/main/services/mock-interview/fixtures/`; the coding
renderer writes there. Scenarios reference that home; rehearsal `fixtures/` holds the standup screen only.
Product plan screens are fixture IDs validated by the catalog, not filesystem paths.

The checked-in PNGs are locally rendered client dashboards, a standup board and an architecture diagram. A scripted screen source
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
    {
      "id": "screen",
      "atMs": 3500,
      "kind": "screen",
      "image": "../../../src/main/services/mock-interview/fixtures/dashboard.png"
    }
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
`detail` (latest eligible completed answer); `answer-mode` (`enabled`); `fault` (`fault`, `durationMs`). Fault names:
`socket-drop`, `silent-them`, `assistant-slow`, `assistant-fail`, `capture-timeout`,
`missing-display`, `oversize-image`. Screen faults apply to the next capture while active;
assistant faults apply to calls while active. Scripted drops emit reset and discard unfinished
speech; audio drops close the actual socket abnormally and let Deepgram's own backoff reconnect.

Expectations: `request`, `suggestion`, `coach`, `screen`, `no-interims`, `summary`, `capture-warning`,
`reconnect`, `busy`, `assistant-error`, `capture-error`, `recording`, `batch`, `context`,
`context-coach` (`contains` must appear in an outgoing answer / Next point request's user content).
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
admissions and invalidation/expiry/suspension transitions. Transitions also carry
`classifier-started`, `answer-started` and `speculation-started/promoted/discarded` (with the
`suggestionId` that links a candidate turn to its request record); `speculation` totals them, so
discarded speculative calls (which still appear in `requests` as cancelled) are countable as
spend. Scripted `fromFinal` latencies exclude live endpointing (600 ms). They omit prompts, answers, keys and
image bytes; captures retain SHA-256 digests and pixel errors. Successful full prompts/answers
remain in the private isolated SQLite profile. Failed/no-op calls retain metadata only.
Treat retained profiles and custom scenario text as private and remove them when no longer needed.

### Latency evidence

The report also has `latency: { summary, records }` from the same `LatencyTracker` the app uses
(`meetings/assist/latency.ts`), plus `RequestOutcome.classifier` (canonical verdict) and
`RequestOutcome.usage` (absent = unknown; canned replies report none). Denominators:

- `records` are the finished per-candidate/run records (up to 200); `summary` has counts and
  medians grouped by "verdict · path", speculation started/promoted/discarded with discard reasons,
  fallbacks, outcomes and missing/partial usage. Failures, no-ops and discarded speculations are
  counted apart, never averaged into answer medians.
- "First readable" is the first main-process broadcast whose visible text has a letter or digit
  (not the no-op, not Markdown delimiters or filler alone): a proxy for visibility, not paint.
- Records are redacted to ids, enums, canonical verdicts, malformed shapes and durations; never
  text, prompts, names, raw provider output or error bodies. Durations are monotonic; audio-clock
  values are not mixed in.
- Mock feeds the same tracker in `MockEvidence` and logs one `[sanas] mock latency {summary}` line
  at session end. Practice results and metrics are unchanged; discarded speculations stay out of
  per-question results but are in the summary.

Canned and scripted runs prove the plumbing, not live latency or answer quality. Owner live
acceptance: automatic speech-end-to-first-readable median <= 2.5 s; per-verdict counts and medians
showing request/room parity; failures, no-ops and discards reported separately; reconnect
timestamps aligned with playback; watchdog behaviour during long silence.

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

Optional top-level `coach: true`, `meetingContext` (Start text, at most 20,000 characters,
saved as the meeting's revision 0) and `audio` (WAV path) enable those legs. Slides were
retired on 2026-11-04: a scenario with `slides` or a `slide` step is rejected. Summaries require at least five live
finals. Leave time for turn grace, assistant completion, and faults; an acquisition timeout
alone needs five seconds. Canned summaries echo the received transcript section so content checks
test prompt delivery and persistence, not summarization quality.

## Fast verification

```powershell
npm run typecheck
npm run lint
npm exec -- vitest run src/main/services/mock-interview src/main/db/repos src/main/ipc src/main/rehearsal scripts/rehearsal src/main/services/meetings/assist/suggestion-runner.test.ts src/main/services/meetings/index.test.ts src/main/services/meetings/merge src/main/services/history src/renderer/src/lib/meeting/start-captured-meeting.test.ts src/renderer/src/app/pages/MockInterviewPage.test.tsx src/renderer/src/app/settings src/renderer/src/interviewer-app
npm run build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/rehearsal/run.ps1 -Scenario mock-interview -Tier scripted -Assistant canned
```

Run that ONE free scripted rehearsal, serially. Add another canned scenario only when the
change touches what it exercises (e.g. `coding-interview` for screen-capture prompts,
`meeting-context` for Start/context plumbing). Each canned wrapper includes a local build. Do not add full tiers, packaged smokes or
paid provider runs to this gate. Unit tests mock Electron and cover real-capture/audio seams.
