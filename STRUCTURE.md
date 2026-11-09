# Sanas — Structure

_Code-shape map: components, responsibilities, dependencies, structural debt._
_System design lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)._

Current rulings live in `docs/DECISIONS.md`; its August/September history is preserved
in `docs/archive/DECISIONS-2026-08-09.md` to keep the current decision map below 800 lines. November speculation rationale lives in
`docs/archive/DECISIONS-2026-11-latency.md`.

Last full review: 2026-08-27

## Status

Phases 0–3 built + most of Phase 4 (summaries, recording, reconnect, packaging).
Layout below reflects what exists.

## Layout

Capture calibration: `shared/meeting/audio-capture.ts` owns the typed envelopes and bounds.
`ipc/audio/` owns validated PCM/probe ingress (moved from `ipc/platform/audio-chunk`).
`meetings/capture/timing/` owns ordered main-clock brackets and accepted-sample rebasing.
`renderer/src/audio/capture-clock.ts` bridges generation-bound worklet messages; the static
worklet stamps sample positions and answers probes only during a processing quantum.
`diagnostics/rehearsal/audio/synthetic-capture.ts` supplies explicit synthetic graph evidence.

Assistance memory: `meetings/assist/suggestion/answers/` owns occurrence/revision reservations
and runner lifecycle coverage; `LiveSession` owns its meeting lifetime and main-originated
answer reselection. `assistant/coach/coverage/` owns the frozen job-point catalog and bounded
quoted user-speech ledger. `MeetingPrompts` builds the catalog at Start; `LiveSession` retains
evidence and retracts speaker corrections. Only coach requests render this evidence.

Reconnect continuity: `stt/deepgram/recovery/` owns the bounded PCM FIFO and fake-socket
recovery tests. `meetings/capture/speaker-session.ts` owns mono connection mapping and
historical pins; `shared/meeting/speaker-identity.ts` carries main-owned confirmation/current/
selected IDs. `app/meeting/speakers/LiveSpeakerControls.tsx` owns the live voice picker and
awaited pin feedback; the page and overlay consume authoritative state.
`lib/meeting/useTranscript.ts` applies confirmed selections to both transcript views;
its identity regression test sits beside it.

Resumes are owned by the job: `db/repos/job/` (`job-resume.ts` + v11 schema), `ipc/jobs/resume/` (get/set + the main-owned PDF/DOCX import picker) and the
job page's Resume tab (`app/jobs/resume/`: `JobResume.tsx`, `ResumeDraftEditor.tsx`, `resume-draft.ts`).
Start resolves the snapshot in `services/meetings/context/start-grounding.ts` for both Live
and Mock; `lib/meeting/useJobHasResume.ts` gives Live its Interview default. The
importer/validator now live in `services/jobs/resume/`; the type stays in
`shared/meeting/meeting-resume.ts` (it is also the meeting snapshot contract; renaming it is deferred).

Rehearsal homes: `src/main/diagnostics/rehearsal/` owns explicit isolated rehearsal dispatch, scenario
validation/assertions (`scenario/`) and scripted providers/correlation (`outcomes/`).
`runner/comparison.ts` reuses the request builder, runner and rehearsal assistant for matched
Full/Smart trials. `scripts/rehearsal/trials/compare.ps1` and `summarize.ps1` wrap local Node tools
for those trials and copied-log stage percentiles; both log under `.tmp/owner-runs/`.
Its `runner/` owns flags, evidence, steps, clock/audio pumping and final checks/report;
`audio/` owns WAV replay/socket faults,
and `screens/` owns fixture acquisition and real display verification;
The former live engine now lives in `src/main/services/mock-interview/`; the live CLI tier is
retired. The product service owns plans/fixtures, serialized turn-taking, window/TTS lifecycle
and practice result collection. `meetings/observation/` is the one home for main-only, best-effort observers (meeting stream, run events,
assistance decisions; each a thin typed stream on `observer-bus.ts`); `mock-interview/turns/request-outcome.ts` owns the
request-outcome shapes the mock-interview report builds on and the rehearsal imports (production assist code carries none).
`outcomes/outcomes.ts` owns request correlation/redacted outcome records, `scenario/semantics.ts` bounded content
rubrics, and `screens/geometry.ts` DIP-to-thumbnail mapping. Rehearsal evidence subscribes to assistance
decisions through `subscribeAssistance` like any other observer, without changing assistance policy.
`scripts/rehearsal/credentials.ps1` owns selective 1Password reads and environment cleanup;
`scripts/rehearsal/` owns owner entry points and the verbatim owner-run 1.0.0 template
from `~/.claude/templates/scripts/`; its `scenarios/` holds JSON and `fixtures/` only the standup PNG.
Shared interview screens live in `services/mock-interview/fixtures/`.

```
sanas/
├── src/                                    # (container; no files of its own)
│   ├── main/                               # Electron main process; index.ts = mode dispatch (normal / --smoke / --rehearsal), system-audio.ts = loopback handler
│   │   ├── lifecycle/                      # userData identity, capped main log, normal startup
│   │   ├── diagnostics/                    # packaged smoke diagnostics + rehearsal
│   │   │   └── rehearsal/                  # isolated scripted/audio composition
│   │   │       ├── scenario/               # validation, assertions, semantic rubrics
│   │   │       ├── outcomes/               # providers and request correlation
│   │   │       ├── runner/                 # options, observers, steps, clock and reports
│   │   │       ├── audio/                  # WAV replay and socket faults
│   │   │       └── screens/                # fixture display and verification
│   │   ├── windows/                        # BrowserWindow builders and main → all-windows broadcast
│   │   ├── ipc/                            # validated typed IPC handlers (delegate only); index.ts + validate.ts at the root
│   │   │   ├── jobs/                       # jobs, glossary, deletion, application and memory IPC
│   │   │   │   └── resume/                 # job resume get/set + native resume picker
│   │   │   ├── history/                    # read-only historical slide markers
│   │   │   ├── audio/                      # generation-bound capture ingress: PCM validation and probes
│   │   │   ├── live-controls/              # context, admission, capture and visibility-ack IPC
│   │   │   ├── mock-interview/             # mock commands + validation
│   │   │   ├── platform/                   # global-hotkey status
│   │   │   ├── screen-capture/             # screen-capture IPC + validation
│   │   │   └── shell/                      # overlay/main windows (toggle, resize, ghost, compose handshake) and updater IPC
│   │   ├── services/
│   │   │   ├── stt/                        # SttProvider seam, endpointing and keyterm budget
│   │   │   │   └── deepgram/               # Deepgram provider, session, event normalization, watchdog, stream URL
│   │   │   │       └── recovery/               # bounded PCM backlog and fake-socket test support
│   │   │   ├── turns/                      # pure completed-turn assembly, transcript formatting/windowing
│   │   │   ├── assistant/                  # prompts, triggers, shared types and answer logic
│   │   │   │   ├── answer-context/         # answer prompt context: window split, anchor text, told stories, ShownLedger
│   │   │   │   ├── classifier/             # turn classifier, verdict parsing, failure diagnostics
│   │   │   │   ├── provider/               # AssistantProvider seam, Claude implementation (the only Anthropic SDK importer)
│   │   │   │   ├── coach/                  # next-point policy and prompts
│   │   │   │   │   └── coverage/           # frozen job-point catalog and quoted-speech ledger
│   │   │   │   └── live-controls/          # typed/detail/audience prompt instructions
│   │   │   ├── mock-interview/             # product plans/fixtures, interviewer, turn engine, session/results
│   │   │   │   ├── turns/                  # engine, interviewer and session lifecycle
│   │   │   │   ├── plans/                  # validated JSON plans with fixture IDs
│   │   │   │   └── fixtures/               # canonical interview/dashboard PNGs
│   │   │   ├── meetings/                   # live lifecycle/STT/audio orchestrator; index.ts + live-controls.ts facades
│   │   │   │   ├── assist/                 # assembly (live-session.ts), prompt state (meeting-prompts.ts)
│   │   │   │   │   ├── automatic/          # automatic candidate lifecycle, question ledger, speculative answer
│   │   │   │   │   │   └── breaker/        # classifier consecutive-failure circuit breaker
│   │   │   │   │   ├── manual/             # Answer now, manual and screen-capture admission, composer screen drafts
│   │   │   │   │   ├── coach/              # next-point coaching coordinator
│   │   │   │   │   ├── suggestion/         # request building, in-flight policy, runner, run publication
│   │   │   │   │   │   └── answers/        # answer occurrence reservations and run lifecycle coverage
│   │   │   │   │   └── latency/            # stage-timing correlation and summary
│   │   │   │   ├── observation/            # best-effort observers: meeting stream, run events, assistance decisions
│   │   │   │   ├── capture/                # channel identity and capture health
│   │   │   │   │   └── timing/             # ordered main-clock brackets and accepted-sample rebasing
│   │   │   │   ├── context/                # prepare/commit/publish meeting-context changes + meeting grounding
│   │   │   │   ├── status/                 # live meeting and post-processing guards, historical job filing
│   │   │   │   ├── summary/                # summary generation, output parsing, email, historical slide markers
│   │   │   │   ├── records/                # saved-meeting export and removal
│   │   │   │   └── postprocess/            # work on a finished meeting
│   │   │   │       ├── rediarize/          # batch pass and speaker carry-over
│   │   │   │       ├── merge/              # pure merge planning and DB apply
│   │   │   │       └── recovery/           # close rows stranded by an earlier process
│   │   │   ├── platform/                   # OS/app integrations (grouping parent)
│   │   │   │   ├── hotkeys/                # registration/status, repeat suppression, callback errors
│   │   │   │   ├── updates/                # updater service and meeting-aware restart checks
│   │   │   │   ├── email/                  # EmailProvider seam and SMTP transport
│   │   │   │   └── retention/              # scheduled/on-demand recording and meeting cleanup
│   │   │   ├── jobs/                       # counted job deletion and single-use preview tokens
│   │   │   │   ├── applications/           # resumes-pack import: map, merge, draft; application-import.ts is the facade
│   │   │   │   │   ├── import/             # list, preview (+ typed fields/session) and apply (+ values)
│   │   │   │   │   └── source/             # read-only edge to the resumes project: refresh, files, validation, config
│   │   │   │   ├── resume/                 # job resume validation, bounded PDF/DOCX import
│   │   │   │   │   └── fixtures/           # synthetic DOCX for import tests
│   │   │   │   └── memory/                 # memory rewrites (generate), review workflow (review), prompts
│   │   │   ├── history/                    # grounded ask-your-history retrieval and answers
│   │   │   │   └── live/                   # live same-job evidence: hits, excerpts, deadline session, read-only worker
│   │   │   ├── audio-store/                # WAV recording of accepted capture audio
│   │   │   └── screen-capture/             # display choice, one-shot screenshot and encoding
│   │   ├── db/                             # async open/backup/migrations and SQLite helpers
│   │   │   ├── migrations/                 # runner + versioned DDL (schema only, no queries)
│   │   │   ├── repos/                      # entity repositories and all SQL strings
│   │   │   │   ├── job/                    # job-owned content: saved resume, glossary, application links, deletion
│   │   │   │   │   └── memory/             # approved memory and per-meeting proposals
│   │   │   │   ├── meeting/                # meeting row, creation, grounding, context, historical slide readers
│   │   │   │   ├── history/                # transcript search and bounded live-evidence reads (FTS)
│   │   │   │   ├── suggestion/             # suggestions, detail grounding, screen-answer storage codec
│   │   │   │   └── transcript/             # segments and speaker names
│   │   │   └── testing/                    # test-only SQLite adapter and rehearsal latency fixture
│   │   └── config/                         # settings, secrets and exhaustive settings schema
│   ├── preload/                            # typed contextBridge API
│   ├── renderer/                           # (container; the HTML entry pages)
│   │   ├── public/                         # unbundled AudioWorklet and static assets
│   │   └── src/                            # (container; env.d.ts only)
│   │       ├── app/                        # library React application
│   │       │   ├── shell/                  # app header (identity, page tabs, meeting status, overlay toggle)
│   │       │   ├── controls/               # Switch, FieldRow, Badge, KeyBadge
│   │       │   ├── pages/                  # route/page components
│   │       │   ├── meeting/                # saved-meeting record pieces
│   │       │   │   └── speakers/           # live voice picker and pin feedback
│   │       │   ├── mock-interview/         # practice results table and mock-interview hook
│   │       │   ├── jobs/                   # job detail tabs
│   │       │   │   ├── applications/       # New job from / refresh from application
│   │       │   │   ├── deletion/           # counted job-delete dialog and its wording
│   │       │   │   ├── memory/             # approved-memory editor, proposal review, context-size meter
│   │       │   │   └── resume/             # job resume editor, draft rules, Unsorted placeholder
│   │       │   ├── settings/               # cross-section tests only
│   │       │   │   ├── sections/           # one component per Settings section + section index
│   │       │   │   │   └── status/         # hotkey and update status wording (pure)
│   │       │   │   └── frame/              # section list, index, pane, card, draft state, save bar
│   │       │   │       └── paging/         # pure page order + useSettingsPager
│   │       │   └── styles/                 # layered shared stylesheet
│   │       ├── interviewer-app/            # offline-speech/caption/share/control entry
│   │       ├── overlay-app/                # separate small overlay bundle
│   │       │   ├── shell/                  # session composition, layout, header, status, preferences
│   │       │   │   └── navigation/         # workspace reducer, local shortcuts, rail, compose handshake
│   │       │   ├── suggestions/            # answer surface, history coordination, manual requests
│   │       │   ├── workspaces/             # frame + secondary views (Screen, Transcript, Context)
│   │       │   │   └── composer/           # Ask: draft state, submission, view
│   │       │   ├── controls/               # overlay control wrappers and icons
│   │       │   ├── layout/                 # opacity, divider ratio/drag, resize grips
│   │       │   ├── styles/                 # the overlay's four CSS layers
│   │       │   └── capture/                # capture action, status subscription, composer attachment state
│   │       ├── audio/                      # mic/loopback capture and worklet bridge
│   │       ├── lib/                        # pure shared renderer helpers
│   │       │   ├── meeting/                # meeting state/transcript hooks + context/, start/
│   │       │   ├── format/                 # time, speaker and hotkey label formatters
│   │       │   ├── navigation/             # orientation-aware tab arrow/Home/End rule
│   │       │   └── suggestions/            # safe suggestion rendering and history reducer
│   │       └── dev/                        # typed browser-preview bridge mocks
│   │           └── jobs/                   # job mocks: deletion, application import, memory
│   └── shared/                             # cross-process contracts: per-domain folders + a few root files (ipc.ts, types.ts, settings-limits.ts)
│       ├── meeting/                        # meeting start/context/resume contracts, summary markdown
│       ├── suggestion/                     # ⟨…⟩ filler marker, search markers, suggestion labels
│       ├── jobs/                           # renderer-safe job contracts: applications, import baseline, deletion, limits
│       ├── mock-interview/                 # typed setup/state/result IPC contracts
│       ├── presentation/                   # historical slide and timeline contracts (read-only)
│       ├── live-controls/                  # context, admission, suggestion metadata, capture, visibility ack
│       ├── hotkeys/                        # global shortcut actions and registration status
│       └── updates/                        # sanitized updater snapshots
├── scripts/                                # repository, release and owner-operation tooling
│   ├── release/                            # version, package, publish, install and smoke tooling
│   ├── eval/                               # paid prompt evals (owner-run .ps1 + vitest-run .eval.ts)
│   ├── rehearsal/                          # runner, credentials and fixture rendering
│   │   ├── scenarios/                      # scripted/audio JSON
│   │   ├── trials/                         # matched-profile compare and copied-log latency summary
│   │   └── fixtures/                       # standup.png only
│   └── owner/                              # redacted owner operation dispatch/logging
├── .github/
│   ├── workflows/                          # CI and manual release workflows
│   └── actions/                            # (container)
│       └── node-setup/                     # shared local action (Node/download-cache setup)
├── docs/                                   # living docs and Docket items
├── vite.renderer.config.ts                 # browser-only renderer preview
├── vitest.config.ts                        # test runner; @shared alias only
└── STRUCTURE.md
```

Container-only directories (`src/`, `src/renderer/`, `src/renderer/src/`, `.github/`, `.github/actions/`) hold no code of their own and
are deliberately not homes. `src/main/` is a home only for the process entry (`index.ts`) and the display-media
handler (`system-audio.ts`); new main-process code belongs in a responsibility folder, not beside them.

**Enforced homes** (one bullet per directory in the tree above, in tree order):

- `src/main/` — process entry (`index.ts`, normal vs `--smoke` vs `--rehearsal` dispatch) and the display-media loopback handler (`system-audio.ts`).
- `src/main/lifecycle/` — userData identity, capped/redacted main logging and normal startup wiring (`window-policy.ts`: quit when the main window closes, hide the overlay when a meeting goes idle); normal startup is not loaded by smoke.
- `src/main/diagnostics/` — isolated, headless packaged diagnostics: the `--smoke` checks and the `rehearsal/` harness below. It depends on product code (e.g. the request-outcome shapes in `services/mock-interview/turns/`), never the reverse.
- `src/main/diagnostics/rehearsal/` — isolated dispatch/composition; no ordinary startup policy.
- `src/main/diagnostics/rehearsal/scenario/` — scenario validation, assertions and bounded content rubrics.
- `src/main/diagnostics/rehearsal/outcomes/` — scripted providers and request/span correlation.
- `src/main/diagnostics/rehearsal/runner/` — options, observer evidence, step execution, clock/audio pump and final checks/report; `comparison.ts` is the matched Full/Smart trial driver (production request builder + runner + `RehearsalAssistant`), launched only by `scripts/rehearsal/trials/compare.*`.
- `src/main/diagnostics/rehearsal/audio/` — PCM replay and socket fault injection.
- `src/main/diagnostics/rehearsal/screens/` — fixture display, capture verification and coordinate geometry.
- `src/main/windows/` — BrowserWindow builders and the main → all-windows broadcast (`app-window.ts`: `createAppWindow`/`loadAppPage`, the only definition for app-page windows — their webPreferences and dev-URL vs file loading (rehearsal fixture display excepted); `interviewer-window.ts`: the separate mock output window, which restricts broadcasts to mock state; `overlay-bounds.ts`: pure on-screen fitting of saved overlay bounds; `main-window.ts`: create or reveal — restore/show/focus, never reload, reports close through `onMainWindowClosed`; `overlay-window.ts`: show/hide/toggle; `window-chrome.ts`: the hidden title bar + caption-button colours mirrored from tokens.css).
- `src/main/ipc/` — typed IPC handlers; validate ingress and delegate, with no business logic. `index.ts` registers them; `validate.ts` is the shared validator (it also owns `requireMeetingStart`, the Start options check). Handlers are grouped by feature below.
- `src/main/ipc/jobs/` — jobs, glossary, deletion and application IPC (`jobs.ts`, `deletion.ts`, `applications.ts`, `memory.ts`, `validate.ts`, and `resume/` for the job resume); the privileged channels answer only the library window (`requireLibrarySender`).
- `src/main/ipc/jobs/resume/` — `jobs.getResume`/`setResume` (validated by `validateResume`) and `resume-import.ts`, the native PDF/DOCX picker returning an unsaved draft; the renderer never supplies a filesystem path.
- `src/main/ipc/history/` — `presentation-history.ts`: read-only historical slide markers.
- `src/main/ipc/audio/` — generation-bound capture ownership, PCM validation and probe replies.
- `src/main/ipc/live-controls/` — context, admission, capture and visibility-ack IPC (`live-controls.ts` + `-validation`).
- `src/main/ipc/mock-interview/` — validated mock commands (`mock-interview.ts` + `-validation`); speech ACKs require the output sender.
- `src/main/ipc/platform/` — `hotkeys.ts`: global-shortcut status IPC.
- `src/main/ipc/screen-capture/` — screen-capture IPC (`screen-capture.ts` + `-validation`).
- `src/main/ipc/shell/` — window and app-shell IPC: `windows.ts` (overlay toggle/resize/ghost, compose handshake and the parameterless Open Sanas) and `updates.ts` (typed updater snapshots and get/check/restart).
- `src/main/services/` — main-process services and provider seams.
- `src/main/services/stt/` — the swappable STT seam (`index.ts`, `types.ts`); `keyterm-budget.ts` holds Deepgram's keyterm limits so callers pass an ordered list and never a vendor budget; `endpointing.ts` the shared endpointing silence the scripted STT mirrors.
- `src/main/services/stt/deepgram/` — the Deepgram implementation behind the seam: provider and batch (`deepgram.ts`), socket lifecycle and PCM-anchored clock (`deepgram-session.ts`, `DeepgramSession`), stall watchdog (`deepgram-watchdog.ts`), stream URL (`deepgram-stream-url.ts`) and message normalization (`deepgram-events.ts`); only `stt/index.ts` (and the rehearsal runner's dynamic import) reach it.
- `src/main/services/stt/deepgram/recovery/` — reconnect continuity: the bounded PCM FIFO (`pcm-backlog.ts`) and the fake socket recovery tests use.
- `src/main/services/turns/` — pure turn assembly and identity-role types; no I/O or timers; `latest-question.ts` picks the question Answer now answers; `transcript-format.ts` is the canonical main-side transcript labels/windowing.
- `src/main/services/assistant/` — the swappable assistant seam and shared answer/classification logic.
- `src/main/services/assistant/answer-context/` — `automatic-turn.ts` owns the neutral automatic focus block and `TriggeringTurn`; answer prompt context: current-exchange/background window split, anchor text (`anchor.ts`: `CURRENT_QUESTION_RULE`, `ANCHOR_REMINDER`, `LatestQuestion`), told stories, `ShownLedger` (`shown-ledger.ts`: the one place a shown suggestion is routed into the recent/told/coach memories, used by `LiveSession` and the eval), and `topic-switch-fixture.ts` (invented data + window builder; scoring lives in `scripts/eval/carried-terms.ts`).
- `src/main/services/assistant/classifier/` — the turn classifier (`classifier.ts`), pure tolerant-but-conservative verdict parsing (`classifier-verdict.ts`: canonical `formatVerdict`, `isAcceptedVerdict` and the one `CLASSIFIER_FAILURE_REASONS` list and content-free malformed shapes) and `failure-diagnostics.ts` (allowlists provider failure metadata for classifier diagnostics: category incl. `connection`, error class `errorName`, status, request ID, model, elapsed; the assistance coordinator owns the suspension timer and publishes availability through MeetingState).
- `src/main/services/assistant/provider/` — the `AssistantProvider` seam (`provider.ts`), the Claude implementation (`claude.ts`), `claude-usage.ts` (extracts Anthropic usage into `ProviderUsage`; missing = unknown), provider-neutral `provider-evidence.ts` (`reportUsage`/`reportTiming`) and `provider-error.ts` (the neutral failure category a provider tags on its transport errors; failure-diagnostics reads it, never vendor class names); the only home that imports `@anthropic-ai/sdk`.
- `src/main/services/assistant/coach/` — next-point eligibility policy and coach prompt construction.
- `src/main/services/assistant/coach/coverage/` — the frozen job-point catalog (`catalog.ts`) and the bounded quoted user-speech ledger (`ledger.ts`) behind coach evidence.
- `src/main/services/assistant/live-controls/` — typed, detail, audience and screen-capture request instructions.
- `src/main/services/mock-interview/` — one product engine, plan validation, interviewer seam consumer, session lifecycle, bundled JSON plans/PNG fixtures and shared live-turn result correlation; `shortcuts.ts` is the mock-only shortcut registration/release.
- `src/main/services/mock-interview/turns/` — interviewer consumer, serialized engine, `answer-wait.ts` (candidate-answer silence/idle-prompt clock), session lifecycle, and the result evidence/report builders (`evidence.ts`, `report.ts`). `request-outcome.ts` holds `RequestOutcome`/`RequestTiming`, `publicOutcome` and `proseWords`: the request shapes the report builds on, also imported by the diagnostics rehearsal; production assist code does not carry them. Rule: nothing in `turns/` imports the parent.
- `src/main/services/mock-interview/plans/` — bundled JSON validated by pure validatePlan in the production catalog.
- `src/main/services/mock-interview/fixtures/` — canonical screen PNGs shared by product and rehearsal scenarios.
- `src/main/services/meetings/` — meeting lifecycle/STT/audio orchestration plus meeting-level facades: `index.ts` (lifecycle, STT wiring, audio ingest and final persistence; capture-binding lifecycle lives in `capture/timing/capture-binding.ts`; its tests stay on the mocked `SttProvider` seam, Deepgram replay is tested in `stt/deepgram/recovery/`) and `live-controls.ts` (context/manual/answer-mode control facade).
- `src/main/services/meetings/assist/` (root: `live-session.ts` assembly, `meeting-prompts.ts`; code lives in the homes below) — per-meeting prompt/grounding state wired to the provider, DB and windows.
- `src/main/services/meetings/assist/automatic/` — the automatic candidate lifecycle (`live-assistance.ts`: turn assembly → prefilter → classifier → freshness/cooldown → runner, timers and invalidation), `question-ledger.ts` (carries uncovered stacked questions into one suggestion) and `speculative-answer.ts` (the one unpublished answer started alongside the classifier and its promote/discard rule); `live-assistance.ts` is also the assist-wide coordinator: it composes `manual/` AnswerNow and `coach/` CoachCoordinator; `live-assistance-harness.ts` is the test-only fake-clock harness shared by the live-assistance suites. `LiveAssistance` consumes same-job evidence through the `EvidenceHandle` type defined in `suggestion/suggestion-requests.ts`.
- `src/main/services/meetings/assist/automatic/breaker/` — `classifier-breaker.ts`: the consecutive-failure circuit breaker (count, suspend, recover, throttled failure log) the coordinator asks about the turn classifier (distinct from `services/assistant/classifier/`, the classifier itself).
- `src/main/services/meetings/assist/manual/` — Answer now (`answer-now.ts`: the hotkey answer and its evidence retrieval), manual and screen-capture admission (`manual-requests.ts`, `capture-requests.ts`) and `capture-drafts.ts` (in-memory composer screen drafts).
- `src/main/services/meetings/assist/coach/` — `coach-coordinator.ts`: next-point coaching while the user talks (feeds the coach policy, owns its timer and buffered run; yields to every answer).
- `src/main/services/meetings/assist/suggestion/` — `suggestion-requests.ts` (request building; `promptMismatchCategories` decides when two requests are the same prompt, comparing every field except an explicit short list; `EvidenceHandle`), `suggestion-in-flight.ts`, `suggestion-runner.ts` (lanes, deadline and persistence) and `run-publication.ts` (the per-run held-text and publish gate).
- `src/main/services/meetings/assist/suggestion/answers/` — `answer-coverage.ts`: meeting-local answer ownership; callers hold an opaque `AnswerReservation` and use `AnswerCoverage` operations (reserve, release, releaseUnpublished, attachRunCancel, lifecycle).
- `src/main/services/meetings/assist/latency/` — `latency.ts` (`LatencyTracker` + `observeLatency()` own both subscriptions and correlate diagnostics and run observations into bounded, allowlisted stage-timing records) and `latency-summary.ts` (`summarizeLatency` reports them).
- `src/main/services/meetings/observation/` — the one home for observation: `observer-bus.ts` (shared typed pub/sub; a throwing listener is dropped, never policy), `meeting-observation.ts` (transcript/signal/state; window policy and mock-interview consume it), `run-observation.ts` (runner events plus `EffectiveProfile`, the full/smart/points policy a run used), `diagnostics.ts` (coordinator decisions; rehearsal subscribes like any consumer). They stay separate streams with their own payloads and consumers and share only the bus and the rule that observation never changes behaviour; payload types come from `assist/`, which emits into them.
- `src/main/services/meetings/capture/` — AUDIO capture-side identity and capture-health policy (screen capture lives in `services/screen-capture/`); `speaker-session.ts` (`SpeakerSession`: mono connection mapping, private pins and `resolve()` identity).
- `src/main/services/meetings/capture/timing/` — `capture-clock.ts` and `capture-session.ts`: ordered main-clock brackets and accepted-sample rebasing; `capture-binding.ts` (`CaptureBinding`: the meeting's binding to one renderer capture generation — owns the `CaptureTimingSession` and probe interval, routes replies, gates which frames are ingested, calls back `onLoss`/`onDiscontinuity`; `meetings/index.ts` only delegates).
- `src/main/services/meetings/context/` — pure preparation followed by commit/publication of live context changes and meeting grounding: `start-request.ts` (`StartRequest`: the renderer's `MeetingStartOptions` plus main-only `practice`), `start-grounding.ts` (`resolveStartGrounding`, the selected job's saved resume (none for Unsorted) plus the profile, resolved inside serialized Start for Live and Mock), `profile.ts` (`interviewProfileSnapshot`, Start selection of the Settings profile), `candidate-data.ts` (neutral escaping and delimited prompt framing for resume (`candidateFacts`) and Interview profile (`interviewProfileFacts`), so resume code and the profile never import each other), `meeting-facts.ts` (combines a `MeetingGrounding` into the candidate-facts block, resume first), `candidate-keyterms.ts` (STT term extraction/interleave for resume and profile, `candidateKeyterms`) and `meeting-keyterms.ts` (the STT hints, glossary plus resume/profile terms, for streaming and batch).
- `src/main/services/meetings/status/` — live-meeting identity, post-processing guards (both expose `on…Change` signals via `change-signal.ts`, so the updates service re-broadcasts without polling) and `filing.ts` (historical job filing; refuses a live meeting).
- `src/main/services/meetings/summary/` — meeting summaries, structured output handling and summary email; `presentation-history.ts` is the historical slide-marker formatting for summaries (presentation mode retired 2026-11-04).
- `src/main/services/meetings/records/` — saved-meeting `export.ts` (Markdown export) and `remove.ts` (`removeMeeting`: row and recording).
- `src/main/services/meetings/postprocess/` — grouping parent for work on a finished meeting (no files of its own).
- `src/main/services/meetings/postprocess/rediarize/` — batch re-diarization and speaker identity/name carry-over.
- `src/main/services/meetings/postprocess/merge/` — split-recording merge planning and application.
- `src/main/services/meetings/postprocess/recovery/` — startup repair of meetings left open by an earlier process.
- `src/main/services/platform/` — email, updates, retention and global-hotkey integrations (grouping parent).
- `src/main/services/platform/hotkeys/` — global shortcut registration/status, repeat suppression and callback containment.
- `src/main/services/platform/updates/` — electron-updater integration and restart eligibility checks.
- `src/main/services/platform/email/` — the email provider seam and SMTP implementation.
- `src/main/services/platform/retention/` — recording/meeting cleanup timers, preview and execution.
- `src/main/services/jobs/` — job deletion (`deletion.ts`: counted preview, SQLite backup, per-meeting removal through `meetings/records/remove.ts`, then the job row) and `preview-tokens.ts`, the main-owned single-use confirmation tokens shared by deletion and application import.
- `src/main/services/jobs/applications/` — importing a job from a resumes interview pack: `application-import.ts` is the thin facade over `import/`; `map-pack.ts` maps a validated pack to job values (name, glossary normalization); `merge-preview.ts` is the pure three-way refresh comparison; `draft-fields.ts` is draft-at-import (create only) through `AssistantProvider`.
- `src/main/services/jobs/applications/import/` — `listing.ts` row projection, `row-status.ts` linked-row status, `preview.ts` create/refresh preview, `preview-fields.ts` typed field values, `preview-session.ts` token payload + pack reload, `apply.ts` confirmed apply, `apply-values.ts` create-value and name resolution.
- `src/main/services/jobs/applications/source/` — the read-only edge to the resumes project: `refresh-runner.ts` (runs its pack CLI), `pack-files.ts` (bounded, contained listing/reading of `.json` packs), `validate-pack.ts` (schema v1 + limits + `packFingerprint`) and `source-config.ts` (re-validated `resumesRoot`/node settings).
- `src/main/services/jobs/resume/` — job resume: ingress validation (`resume.ts`), bounded PDF/DOCX parsing (`import-file.ts`, owner of bounded local reads and the offline parser lifecycle); term extraction lives beside `candidate-data.ts` in `meetings/context/candidate-keyterms.ts`, shared by resume and profile.
- `src/main/services/jobs/resume/fixtures/` — the synthetic DOCX the import tests read.
- `src/main/services/jobs/memory/` — job memory, and the one owner of its review rules: `source.ts` (eligible source, fingerprint, `proposalIsCurrent`), `generate.ts` (serialized per-job rewrites against the last approved revision; skip-if-unchanged and the stale/failed/pending settling; `enqueueMemory` after summaries), `review.ts` (get/save/approve/dismiss/retry and the view status rules such as stale and failed; IPC only validates shapes) and `prompts.ts`.
- `src/main/services/history/` — FTS retrieval and grounded ask-your-history answers.
- `src/main/services/history/live/` — live same-job evidence: `policy.ts` (query specificity), `hits.ts` (ranking: interleave transcript and summary indexes, dedup, neighbour expansion, prompt kind labels), `excerpts.ts` (strict 2,400-char rendering), `session.ts` (frozen, deadline-bounded evidence), `worker-client.ts`/`worker.ts` (read-only worker thread, a separate main build entry running the same `hits.ts` on its own connection); assistance consumes it only through the `EvidenceHandle` defined in `meetings/assist/suggestion/suggestion-requests.ts`.
- `src/main/services/audio-store/` — WAV recording for accepted capture audio.
- `src/main/services/screen-capture/` — display selection, one-shot desktop capture, image sizing/encoding; no meeting or provider policy.
- `src/main/db/` — database connection lifecycle, consistent pre-upgrade backup, migrations and SQLite helpers (`read-only.ts`: `openReadOnlyConnection`, the history worker's read-only connection).
- `src/main/db/migrations/` — schema history: `index.ts` is the runner (`runMigrations`, `schemaVersion`) and holds v1–v5 inline; each later version's DDL sits in its own `*-schema.ts` here, including `job-memory-schema.ts` (presentation v6 and live-controls v7 are kept append-only for retired tables; `job_slides` is orphaned: its repo was deleted, the table kept). `repos/` holds queries only.
- `src/main/db/repos/` — per-entity repositories; the only place SQL strings live. Loose here: `practice.ts` (v8 migration SQL, result persistence and practice listing) and `diagnostics.ts`.
- `src/main/db/repos/job/` — job-owned content: `jobs.ts` (the base job row repo: list/get/create/update/archive, `ensureDefaultJob`), `job-resume.ts` (`getJobResume`/`setJobResume`, one optional row per job) with its append-only v11 schema (`migrations/job-resume-schema.ts`); `glossary.ts` (the glossary SQL, moved out of `jobs.ts`); `applications.ts` (the job↔resumes-application link, `LocalJobState`, and the one-transaction create/refresh writes) with its v13 schema (`migrations/application-schema.ts`: `job_applications` plus the `jobs_delete_guard` trigger); `job-deletion.ts` (per-table counts, the job/meeting snapshot, `isProtectedJob`, and the final `deleteJobRow`); `eligible-meeting.ts` (the one SQL predicate for an eligible meeting: ended, not practice, not Unsorted; shared with `repos/history/live.ts`).
- `src/main/db/repos/job/memory/` — persistence and one compare-and-set only: `approved.ts` (owner-approved text, 3,000-char cap, revisioned) and `proposals.ts` (plain reads/writes plus `markApprovedIf`, the single-transaction approval); its DDL is `migrations/job-memory-schema.ts`; no staleness, skip or retry rules.
- `src/main/db/repos/meeting/` — the meeting repos: `meetings.ts` (row), `meeting-columns.ts` (the one meeting column projection: no resume/profile text, `interview_profile_used` computed in SQL), `meeting-create.ts` (`createMeeting(jobId, title, MeetingCreateInput)`, the one creation transaction; the input is main-resolved and carries the profile snapshot and the Start context, saved as revision 0), `meeting-grounding.ts` (`getMeetingGrounding(id)`: `{ resume, interviewProfile, hasBiography }`, the only read of both snapshots), v9/v10 (`migrations/meeting-resume-schema.ts`, `migrations/meeting-interview-profile-schema.ts`; their original guards are superseded by v12) and v12 (`migrations/meeting-snapshot-clear-schema.ts`: the live immutability triggers on the resume/profile snapshot columns, which allow a clear-to-empty only while a `meeting_snapshot_clear` guard row exists; `moveMeetingToJob` in `meetings.ts` is the only sanctioned clearer, on a job change), `meeting-context.ts` (text-only context revisions, `hasMeetingContext`, merge `moveContextHistory`), `meeting-presentation.ts` (read-only historical slides: `getPresentationHistory`, `hasLegacySlides`).
- `src/main/db/repos/history/` — bounded reads only: `transcripts.ts` (ranked transcript search, `searchSegments`), `live.ts` (transcript/summary/neighbour reads that take a connection so the worker can run them); the summary FTS index DDL is `migrations/summary-schema.ts`; no ranking, dedup or prompt labelling.
- `src/main/db/repos/suggestion/` — `suggestions.ts` (suggestion rows), `suggestion-grounding.ts` (detail grounding reads) and `manual-kind.ts` (the screen-answer storage codec).
- `src/main/db/repos/transcript/` — the transcript rows' own entity repos: `segments.ts` (list/insert/reassign) and `speakers.ts` (names, merge, reassign), with the rediarize rollback test beside them; distinct from `history/`, which only reads for search and evidence.
- `src/main/db/testing/` — `sqlite-test-database.ts`, the local SQLite transaction adapter shared by repository tests (it does not certify Electron ABI packaging), and `latency-fixture.ts`, the rehearsal-only synthetic history seeding.
- `src/main/config/` — settings/secrets persistence and exhaustive settings validation.
- `src/preload/` — typed contextBridge surface exposed to renderers.
- `src/renderer/public/` — AudioWorklet processors and other unbundled assets.
- `src/renderer/src/app/` — library UI root and entry point.
- `src/renderer/src/app/shell/` — the library window frame: `AppHeader` (also the window title bar — drag region, see GOTCHAS), the `Page` union + `NAV` table (`pages.ts`) (the meeting-status wording lives in `lib/meeting/meeting-status.ts`).
- `src/renderer/src/app/controls/` — small shared library controls (`Switch` — also used compact by the overlay's Answer every question, `FieldRow`, `Badge`, `KeyBadge`); styles live in `styles/controls.css`.
- `src/renderer/src/app/pages/` — one component per library route/page; `SettingsPage` is layout and wiring only (its state is `useSettingsDraft`).
- `src/renderer/src/app/meeting/` — pieces of the saved-meeting record: `MeetingRecordHeader` (title and summarize/email/export/delete actions), `TranscriptPanel` (transcript with slide markers plus `SpeakerEditor`), `MeetingSuggestionsTab` and `usePresentationHistory`; `pages/MeetingView` loads the record and composes them with the filing, summary and context cards.
- `src/renderer/src/app/meeting/speakers/` — `LiveSpeakerControls.tsx`: the live voice picker and awaited pin feedback.
- `src/renderer/src/app/mock-interview/` — `MockResults` (practice results table) and `useMockInterview` (setup, job/plan choice, mock state, past sessions, mic capture); `pages/MockInterviewPage` is layout and wiring.
- `src/renderer/src/app/jobs/` — `JobOverview` (name, context, glossary), `JobEmail` (recipient) and `JobMeetings` (history/merge); resume and memory live in `jobs/resume/` and `jobs/memory/`. `JobTabs` owns tab/panel IDs, keyboard focus and mounted panels from a name/render table. `pages/JobDetail` owns load, the meetings list (reloaded via `JobMeetings`' `onMerged`), shared draft/save, composition and meeting drill-in; the tabs stay mounted (hidden) behind an open meeting so drafts survive. `job-draft.ts` holds the pure job-draft rules (unsaved-edit check before a refresh).
- `src/renderer/src/app/jobs/applications/` — New job from application / Refresh from application: `ApplicationPicker` (rows and statuses via `picker-rows.ts`), `ApplicationPreview` (create form or per-field refresh review, conflicts defaulting to Keep Sanas), `preview-format.ts` (field labels and display text for the typed preview values), `apply-request.ts` (builds the apply request) and `useApplicationListing.ts` (the listing hook).
- `src/renderer/src/app/jobs/deletion/` — `JobDeleteDialog` (exact-count confirmation, default button Cancel) and `deletion-copy.ts` (pure count wording).
- `src/renderer/src/app/jobs/memory/` — `JobMemory` composes `ContextSizeMeter`, `ApprovedMemoryEditor` (saved text and explicit save) and `MemoryProposalReview` (oldest-first proposal approve/dismiss/regenerate); `useJobMemory` owns the state, `context-size.ts` the meter maths.
- `src/renderer/src/app/jobs/resume/` — `JobResume` (saved resume with its own Save resume), `ResumeDraftEditor` (paste/import/preview), `resume-draft.ts` (pure draft rules) and `ResumeUnavailable` (the Unsorted bucket takes no resume).
- `src/renderer/src/app/settings/` — only the cross-section tests (`settings-pages.test.tsx`, `settings-controls.test.tsx`); everything else is in the folders below.
- `src/renderer/src/app/settings/sections/` — one component per Settings section, including independent update state and `InterviewProfileSection.tsx` (the one plain-text Interview profile editor), plus pure status wording in `status/` (`hotkey-status.ts`, `update-status.ts`); `SettingsSectionPage.tsx` is the section index that renders the selected section.
- `src/renderer/src/app/settings/frame/` — what every section shares: the section list (`settings-sections.ts`), card (`SettingsSection`), the index (`SettingsNav`, Up/Down), the animated scrolling pane (`SettingsPane`, owner of `SETTINGS_PANE_ID`), the draft state (`useSettingsDraft`: load, externally changed keys, save state machine), the pure patch/dirty/validation logic and page-ownership lists (`settings-draft.ts`) and the save bar.
- `src/renderer/src/app/settings/frame/paging/` — the pager: pure page order (`page-order.ts`: `ORDER`, `selectPage`, `stepPage`, `pageDirection`) and the thin React state wrapper `useSettingsPager`.
- `src/renderer/src/app/styles/` — layered shared stylesheet; no per-page stylesheets. `tokens.css` is shared by both windows; the library imports `index.css` (base → controls → shell → transcript → pages → settings), the overlay imports `overlay-app/overlay.css` (shared tokens → controls, then its own `overlay-app/styles/` layers).
- `src/renderer/src/overlay-app/styles/` — the overlay's four CSS layers, imported in order by `overlay.css`: `overlay-controls` → `overlay-shell` → `overlay-panels` → `overlay-suggestions`.
- `src/renderer/src/interviewer-app/` — local OS speech, captions and shares; no provider/network calls.
- `src/renderer/src/overlay-app/` — deliberately small, separate overlay bundle; `no-native-popups.test.ts` scans every file under it for native tooltip/select/dialog UI that would leak into screen shares.
- `src/renderer/src/overlay-app/shell/` — `OverlaySession` (composes every controller once), `OverlayShell` layout, header, persistent status, preferences popover, window state, Answer every question.
- `src/renderer/src/overlay-app/shell/navigation/` — pure workspace reducer, local shortcut table/dispatch, the rail, and the compose readiness/focus handshake.
- `src/renderer/src/overlay-app/suggestions/` — the answer surface (full and preview) with its action row (`AnswerActions`: history, More detail, Back to source), history/reading coordination and manual-request (detail/audience) policy.
- `src/renderer/src/overlay-app/workspaces/` — the frame that keeps secondary views mounted (`WorkspacePanel` + `Empty`; `OverlayWorkspaces` takes explicit slices, not the whole session) plus one file per view (`OverlayCapturePanel`, `OverlayTranscript`, `OverlayContext`).
- `src/renderer/src/overlay-app/workspaces/composer/` — Ask: draft state, submission and view; kept as a folder because it has several files.
- `src/renderer/src/overlay-app/controls/` — the overlay's small control wrappers (button variants, in-DOM `OverlayTip` tooltip, labelled textarea, Open Sanas) and local icons; not a general component framework.
- `src/renderer/src/overlay-app/layout/` — overlay opacity and divider-ratio persistence, divider drag/measurement, and the three resize grips.
- `src/renderer/src/overlay-app/capture/` — Capture screen action, capture status subscription/helpers and the composer's screen-attachment state (hooks only; the Screen view lives in `workspaces/`).
- `src/renderer/src/audio/` — renderer capture and AudioWorklet downsampling.
- `src/renderer/src/lib/` — shared renderer helpers and small shared components, grouped into the folders below (loose: `overlay-workspaces.ts` workspace names and the local shortcut table shared by the overlay and Settings → Hotkeys; `ipc-error.ts`, `glossary-input.ts`, `icons.tsx`, `SummaryMarkdown.tsx`).
- `src/renderer/src/lib/format/` — `format-time.ts` (clock/when), `speaker-label.ts`, `hotkey-label.ts`: pure label/format helpers.
- `src/renderer/src/lib/meeting/` — live-meeting state: `meeting-state.ts` + `useMeetingState.ts` (reducer/hook), `useTranscript.ts`, `meeting-status.ts` (`describeMeetingStatus`: the one status wording for the app and overlay headers), `useJobHasResume.ts` (whether the selected job has a saved resume, Live's Interview default, stale-reply safe); the two folders below hold the rest.
- `src/renderer/src/lib/meeting/context/` — `meeting-context-draft.ts` + `useMeetingContextDraft.ts` are the draft/apply/reload/conflict logic shared by the Live page's `MeetingContextEditor` and the overlay's Context; `meeting-context-state.ts`, `useMeetingContext.ts`.
- `src/renderer/src/lib/meeting/start/` — `start-selection.ts` is the Interview default/override rule and builds the Start options (`meetingStartOptions`) and the pre-Start context draft rule; `job-choices.ts` (Live picker choices — `startableJobs` drops the Unsorted bucket via `isUnsortedJob` — the remembered job `rememberedJob`/`rememberJob` and `selectionAfterReload`); `start-captured-meeting.ts` (shared capture acquisition/adoption/cleanup).
- `src/renderer/src/lib/navigation/` — `next-tab-index.ts` and colocated tests: pure orientation-aware wrapping arrows/Home/End rule shared by JobTabs and OverlayNavigation. Settings keeps its distinct clamped, arrow-only page navigation.
- `src/renderer/src/lib/suggestions/` — text-safe compact/detail renderers and live history state (`FillerText` renders the ⟨…⟩ improvised-answer marker; `src/shared/suggestion/filler-marker.ts` splits/strips it).
- `src/renderer/src/dev/` — browser-preview implementation of the typed preload bridge: `mock-api.ts` assembles it, `mock-fixtures.ts` holds the static sample data, `mock-live-meeting.ts` the scripted live meeting; `overlay-scenarios.ts` holds the deterministic overlay preview states (`overlay.html?scenario=<name>`) driven through `mockDriver`.
- `src/renderer/src/dev/jobs/` — browser-preview job mocks: `mock-job-deletion.ts`, `mock-job-applications.ts` and `mock-job-memory.ts`; `dev/mock-api.ts` composes them.
- `src/shared/` — types shared by main, preload and renderer. Convention (dk-74c8fe2e): one folder per domain, plus a few root contracts every domain shares (`ipc.ts` channel names, `types.ts` the common IPC types, `settings-limits.ts`); a domain with a single contract file is still a folder.
- `src/shared/meeting/` — meeting-level contracts and text limits (also `summary-markdown.ts`, `interview-profile.ts` the profile text limit); `meeting-start.ts` — `MeetingStartOptions` (`interview?`, `meetingContext?`) and `interviewApplies` (the one Interview-profile rule, used by main's profile snapshot and Live's checkbox); `meeting-context.ts` — the 20,000-character context limit and `requireMeetingContextText`, the one validator Start, Apply and rehearsal scenarios share.
- `src/shared/suggestion/` — suggestion-text helpers: `filler-marker.ts` (`FILLER_OPEN`/`FILLER_CLOSE` for prompts, `splitFiller`/`stripFillerMarkers` for rendering), `search-markers.ts`, `suggestion-label.ts`.
- `src/shared/jobs/` — renderer-safe job contracts and limits: `applications.ts` (pack/preview/apply types; preview values are typed, never display text), `unsorted.ts` (`isUnsortedJob`, the reserved bucket name and `reservedNameError`: the one Unsorted identity), `application-stage.ts` (`stageCapabilities`: the one closed-stage policy — visible, create, refresh, archive — used by listing, preview, apply, row-status and the dev mock), `import-baseline.ts` (storage-independent `ImportBaseline`/`LocalValues`), `deletion.ts`, `limits.ts` (job, glossary and `JOB_PERSONA_MAX_CHARS` limits) and `source-settings.ts` (resumes settings defaults/validation).
- `src/shared/mock-interview/` — cross-process mock contracts.
- `src/shared/presentation/` — historical slide/event/history contracts and timeline ordering (read-only since 2026-11-04).
- `src/shared/live-controls/` — meeting-context, manual-admission, suggestion metadata and screen-capture contracts; `visibility.ts` is the renderer-to-main `SuggestionVisibility` acknowledgement (a commit/frame proxy, not paint), and `readable-suggestion.ts` (`NO_SUGGESTION`, `isNoSuggestion`, `hasReadableText`) is the one definition of a readable suggestion, used by main's first-readable stamp and the overlay's `useSuggestionVisibilityAck`.
- `src/shared/hotkeys/` — global shortcut action and registration-status contracts.
- `src/shared/updates/` — renderer-safe update state and operation contracts.
- `scripts/` — repository tooling plus release and owner-operation entry points.
- `scripts/release/` — versioning, asset/package checks, publication, installation and packaged smoke.
- `scripts/eval/` — paid prompt evals: `topic-switch.ps1` (old vs new prompt builders on an invented fixture; `-DryRun` is free) and `.eval.ts`.
- `scripts/rehearsal/` — owner runner, credentials and offline fixture rendering.
- `scripts/rehearsal/scenarios/` — versioned scripted/audio scenarios.
- `scripts/rehearsal/trials/` — matched-profile and latency-summary owner tools: `compare.ps1`/`compare.mjs` (bundle and run `src/main/diagnostics/rehearsal/runner/comparison.ts`), `summarize.ps1`/`summarize.mjs` (copied-log stage percentiles) and `summarize.test.ts`, and `history-latency.ps1`/`history-latency.mjs` (live-history retrieval latency); each `.ps1` dot-sources `../owner-run.ps1` from `$PSScriptRoot` and runs from any cwd.
- `scripts/rehearsal/fixtures/` — the rehearsal-only standup screen.
- `scripts/owner/` — redacted logs and owner-only release operation dispatch.
- `.github/workflows/` — CI and manual release workflows.
- `.github/actions/node-setup/` — shared local workflow action: Node/download-cache setup.

Tests are colocated `*.test.ts`/`*.test.tsx` files (Vitest, `npm test`) beside the modules they
cover. Coverage includes provider normalization, turn/assistant policy, live-control
state/admission/grounding, historical slide readers, meeting lifecycle and post-processing, startup/backup/smoke/update wiring,
IPC validation, renderer reducers/renderers, shared timeline/format helpers, window behavior, and
release scripts. Repository SQL tests use the local Node SQLite adapter; Electron-ABI diagnostics remain
a separate check, rather than ordinary Vitest loading of `better-sqlite3`.

## Responsibility boundaries (the seams that matter)

- **Startup modes stay isolated.** `main/index.ts` selects `--smoke` or `--rehearsal` before importing normal
  startup; rehearsal uses an isolated userData and installs its test providers only under that flag;
  diagnostics use disposable userData and never initialize windows, IPC, providers, audio, retention,
  or updates.
- **Providers are interfaces.** `SttProvider`, `AssistantProvider` and `EmailProvider` isolate
  Deepgram, Claude and SMTP so any can be swapped without changing orchestration or UI.
- **`ipc/` stays thin.** Handlers validate and delegate to `services/`; renderers never access APIs,
  secrets or the database directly.
- **Meeting lifecycle and live controls are separate.** `meetings/index.ts` owns lifecycle, STT, audio
  and final persistence. `meetings/live-controls.ts` serializes context, manual request and answer-mode
  actions against injected lifecycle state.
- **Assistance policy stays split.** `turns/turn-assembler` closes turns; assistant triggers,
  classifier and coach policy decide; `meetings/assist/manual/manual-requests` admits explicit requests;
  `live-assistance` coordinates automatic work (Answer now is `manual/answer-now`, next points `coach/coach-coordinator`); `speculative-answer` decides whether an early
  answer may be published; `suggestion-runner` owns generation, the unpublished state and persistence.
- **Prompt snapshots are synchronous and read-only.** `meetings/assist/meeting-prompts.ts` resolves and
  caches immutable grounding when context changes; request snapshots perform no database writes.
- **Context publication follows persistence.** Meeting context is published only after its
  repository write succeeds; the Start context lands in the creation transaction. Historical slide
  views read immutable recorded deck versions and events and nothing writes them any more.
- **Repos own SQL.** No SQL strings live outside `db/repos/`; FTS5 expressions come only from
  `db/fts-query.ts`, and repository row types do not depend on service modules.
- **Updates expose sanitized state only.** Packaged normal startup owns updater network traffic and
  restart checks; renderer IPC is limited to typed snapshots and get/check/restart operations.
- **Overlay is a separate bundle.** It remains small and receives all privileged data through preload.
- **Settings and styles have fixed homes.** Settings sections are components under `app/settings/`;
  styles remain one layered vocabulary under `app/styles/`.

## Structural debt

- `.workspace-body` / `.workspace-actions` sit in `overlay-app/styles/overlay-panels.css` while the
  workspace frame is in `overlay-shell.css`.
- The provider-neutral seam still carries Anthropic vocabulary: `ProviderTiming`'s `'policy'` variant
  (`assistant/types.ts`) names Anthropic's `effort` levels and `thinking` modes (`between_tools`). Widen
  it to opaque provider-tagged strings when a second `AssistantProvider` arrives; until then
  `claude.ts` computes one `wirePolicy()` per request for both the body and the event.
- `services/assistant/` is broad (six loose files plus five subfolders): prompts/ and contracts/ groupings are tracked by dk-00f3ff65. `meetings/` is grouped (records/, postprocess/) and `meetings/assist/` is split into automatic/, manual/, coach/, suggestion/ and latency/ (dk-c0cd0363).
- `shell/` and `workspaces/` still reference each other: `WorkspacePanel` reads `panelId`/`tabId`
  from `shell/navigation/`, and `OverlaySession` imports the composer hook. Workspaces take explicit
  slices, not the session model (dk-ac7c7c73).
- `services/` has 10 children (platform integrations are grouped and transcript formatting lives in `turns/`); adding another sibling means nesting under an existing parent.
- `src/shared/` has 8 domain folders plus three root contracts (`ipc.ts`, `types.ts`, `settings-limits.ts`) — the documented convention; a new domain becomes a folder, not a root file. `src/main/ipc/` is grouped by feature (jobs/, history/, live-controls/, mock-interview/, platform/, screen-capture/, shell/) with `index.ts` and `validate.ts` at the root.
- `app/settings/sections/` now holds 13 code files (Applications joined); group related sections
  before adding more.
- Screen answers are stored as `typed` plus a `[Screen capture]` request-text marker because the
  `suggestions` CHECK constraint has no `capture` kind. A real `capture` kind needs a table rebuild
  migration; the codec in `db/repos/suggestion/manual-kind.ts` is the only place to change.

- `AssistRequest.model`, `AssistRequest.effort` and `AssistRequest.workspaceId` map closely to
  Anthropic-specific knobs, and the Claude provider derives a per-model "thinking off" value from a short `maxTokens`
  (`SHORT_BUDGET_MAX_TOKENS` in claude.ts), also Anthropic-specific. A second provider will need its own model settings and interpretation.
- Live assistance and summaries select `AssistantProvider` through `services/assistant/provider/provider.ts`.
  Normal startup selects Claude; explicit rehearsal startup may install a canned provider.
- SMTP credentials use the same plain local-settings trust model as API keys. `safeStorage` encryption
  for all secrets should be one future change if required.
- `EmailProvider.send(config, mail)` takes an SMTP-shaped configuration. A non-SMTP transport would
  change the seam and its caller; do not abstract it before a second transport exists.

## Resume (saved on the job, snapshotted on the meeting)

- `shared/meeting/meeting-resume.ts` owns the text/name contract and limits (used for both the job's saved resume and the meeting snapshot).
- `db/repos/job/job-resume.ts` (+ v11 `migrations/job-resume-schema.ts`) owns the job's saved resume; `ipc/jobs/resume/` exposes get/set and `resume-import.ts`, the native PDF/DOCX picker; the renderer never supplies a filesystem path.
- `services/meetings/context/start-grounding.ts` is the one place Start reads the job resume; nothing else reads `job_resumes` for a meeting.
- `main/services/jobs/resume/import-file.ts` owns bounded local reads and offline parser lifecycle.
- `main/services/jobs/resume/` owns validation (run once, at IPC ingress), only (no framing or term extraction: candidate-fact framing lives in `meetings/context/candidate-data.ts`, terminology extraction in `meetings/context/candidate-keyterms.ts`).
- `db/migrations/meeting-resume-schema.ts` owns append-only v9 SQL and the immutable-update guard; `createMeeting` persists the text in its one transaction. The resume is not on the `Meeting` row: `getMeetingGrounding(id).resume` is the only read (`MeetingView` via `meetings.getResume`).
- `app/jobs/resume/JobResume.tsx` owns the job editor (draft, import, explicit Save resume); `MeetingView` shows a meeting's saved text read-only. Live/Mock setup have no resume input.
- `MeetingPrompts` attaches candidate facts to the meeting's one system prompt before saving grounding. `meetingKeyterms` builds one ordered hint list for streaming and batch STT; the provider applies its own limits.

## Meeting grounding (resume + Interview profile)

- One concept: `getMeetingGrounding(id)` returns `{ resume, interviewProfile, hasBiography }`. Meeting
  keyterms (streaming, resume, batch), the candidate-facts block (prompts, summary), re-diarize, the single
  merge refusal guard, the practice `noResume` cue and the no-biography prompt fallback all read that
  snapshot; `meetings/index.ts` keeps no resume/profile cache.
- `config/settings.ts` + `settings-schema.ts` own the mutable profile and its validation; main resolves it at
  Start (`context/profile.ts`: applies for Mock, an explicit Interview toggle, or a saved job resume) and
  hands `createMeeting` a `MeetingCreateInput`. A `StartRequest` from the renderer carries neither a
  profile nor a resume.
- `lib/meeting/start/start-selection.ts` (`interviewChecked`) shows the job-resume default unless the user chose;
  LiveMeetingPage sends only an explicit choice (undefined lets main decide) through preload/IPC.
- `MeetingView` receives `interviewProfileUsed` through the existing Meeting projection; large profile text
  stays off list/history IPC objects. Merge refuses meetings with a resume or profile, with
  recorded slides, or when more than one part has meeting context.
