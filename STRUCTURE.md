# Sanas — Structure

_Code-shape map: components, responsibilities, dependencies, structural debt._
_System design lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)._

Current rulings live in `docs/DECISIONS.md`; its August/September history is preserved
in `docs/archive/DECISIONS-2026-08-09.md` to keep the current decision map below 800 lines.

Last full review: 2026-08-27

## Status

Phases 0–3 built + most of Phase 4 (summaries, recording, reconnect, packaging).
Layout below reflects what exists.

## Layout

Resumes are owned by the job: `db/repos/job/` (`job-resume.ts` + v11 schema), `ipc/jobs/resume/` (get/set + the main-owned PDF/DOCX import picker) and the
job page's Resume tab (`app/jobs/resume/`: `JobResume.tsx`, `ResumeDraftEditor.tsx`, `resume-draft.ts`).
Start resolves the snapshot in `services/meetings/context/start-grounding.ts` for both Live
and Mock; `lib/meeting/useJobHasResume.ts` gives Live its Interview default. The
importer/validator now live in `services/jobs/resume/`; the type stays in
`shared/meeting-resume.ts` (it is also the meeting snapshot contract; renaming it is deferred).

Rehearsal homes: `src/main/rehearsal/` owns explicit isolated rehearsal dispatch, scenario
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
assistance decisions; each a thin typed stream on `observer-bus.ts`); `assist/outcomes.ts` owns shared pure result types/counts.
`outcomes/outcomes.ts` owns request correlation/redacted outcome records, `scenario/semantics.ts` bounded content
rubrics, and `screens/geometry.ts` DIP-to-thumbnail mapping. The optional main-only observer in
`services/meetings/observation/diagnostics.ts` reports decisions without changing assistance policy.
`scripts/rehearsal/credentials.ps1` owns selective 1Password reads and environment cleanup;
`scripts/rehearsal/` owns owner entry points and the verbatim owner-run 1.0.0 template
from `~/.claude/templates/scripts/`; its `scenarios/` holds JSON and `fixtures/` only the standup PNG.
Shared interview screens live in `services/mock-interview/fixtures/`.

```
sanas/
├── src/
│   ├── main/                              # Electron main process
│   │   ├── index.ts                       # mode dispatch: normal startup, --smoke diagnostics, --rehearsal harness
│   │   ├── lifecycle/                     # userData identity, capped main log and normal application startup
│   │   ├── rehearsal/                     # isolated scripted/audio composition
│   │   │   ├── scenario/                  # validation, assertions, semantic rubrics
│   │   │   ├── outcomes/                  # providers and request correlation
│   │   │   ├── runner/                    # options, observers, steps, clock and reports
│   │   │   ├── audio/                     # WAV replay and socket faults
│   │   │   └── screens/                   # fixture display and verification
│   │   ├── diagnostics/                   # isolated packaged smoke diagnostics
│   │   ├── windows/                       # BrowserWindow builders and main → all-windows broadcast
│   │   │   ├── app-window.ts              # shared window factory: security webPreferences + dev/prod page load
│   │   │   └── interviewer-window.ts      # restricted mock output window
│   │   ├── ipc/                           # validated typed IPC handlers; delegate only (jobs/: jobs, glossary, deletion, application and memory IPC; jobs/resume/: job resume get/set + native resume picker; mock-interview/, live-controls/, screen-capture/: each feature's handlers + validation)
│   │   ├── system-audio.ts                # display-media loopback handler
│   │   ├── services/
│   │   │   ├── stt/                       # SttProvider seam, endpointing and keyterm budget
│   │   │   │   └── deepgram/              # Deepgram provider, session, event normalization, watchdog, stream URL
│   │   │   ├── turns/                     # pure completed-turn assembly (latest-question.ts: Answer now question pick)
│   │   │   │   └── transcript-format.ts   # canonical transcript formatting/windowing
│   │   │   ├── assistant/                 # AssistantProvider seam, Claude, prompts, classifier, triggers, failure-diagnostics.ts
│   │   │   │   ├── answer-context/        # answer prompt context: window split, anchor text (anchor.ts), told stories, ShownLedger, invented topic-switch fixture
│   │   │   │   ├── coach/                 # next-point policy and prompts
│   │   │   │   └── live-controls/         # typed/detail/audience prompt instructions
│   │   │   ├── mock-interview/            # product plans/fixtures, interviewer, turn engine, session/results
│   │   │   │   ├── shortcuts.ts          # mock-only shortcut registration/release
│   │   │   │   ├── turns/                # engine, interviewer and session lifecycle
│   │   │   │   ├── plans/                # validated JSON plans with fixture IDs
│   │   │   │   └── fixtures/             # canonical interview/dashboard PNGs
│   │   │   ├── meetings/                  # live lifecycle/STT/audio orchestrator, export and removal
│   │   │   │   ├── index.ts               # lifecycle, STT wiring, audio and final persistence
│   │   │   │   ├── live-controls.ts       # context/manual/answer-mode control facade
│   │   │   │   ├── assist/                # assembly (live-session.ts), prompt state (meeting-prompts.ts), shared outcome types
│   │   │   │   │   ├── automatic/         # coordinator, question ledger, speculative answer, classifier/ breaker, testing/ harness
│   │   │   │   │   ├── manual/            # manual and screen-capture admission, composer screen drafts
│   │   │   │   │   ├── suggestion/        # request building, in-flight policy, runner, run publication
│   │   │   │   │   └── latency/           # stage-timing correlation and summary
│   │   │   │   ├── observation/           # best-effort observers: meeting stream, run events, assistance decisions
│   │   │   │   ├── capture/               # channel identity and capture health
│   │   │   │   ├── context/               # prepare/commit/publish meeting-context changes + meeting grounding
│   │   │   │   │   ├── start-request.ts   # StartRequest: the renderer-facing Start choices
│   │   │   │   │   ├── start-grounding.ts # job resume + profile snapshot resolved at Start
│   │   │   │   │   ├── profile.ts         # Interview-profile Start selection
│   │   │   │   │   ├── candidate-data.ts  # escaping + resume/profile prompt framing
│   │   │   │   │   ├── meeting-facts.ts   # combined candidate-facts block from a grounding
│   │   │   │   │   ├── candidate-keyterms.ts # STT term extraction/interleave for resume and profile
│   │   │   │   │   └── meeting-keyterms.ts # glossary + resume/profile STT hints
│   │   │   │   ├── presentation/          # historical slide-marker formatting (read-only)
│   │   │   │   ├── status/                # live meeting and post-processing guards, historical job filing (filing.ts)
│   │   │   │   ├── summary/               # summary generation, output parsing and email
│   │   │   │   ├── rediarize/             # batch pass and speaker carry-over
│   │   │   │   ├── merge/                 # pure merge planning and DB apply
│   │   │   │   └── recovery/              # close rows stranded by an earlier process
│   │   │   ├── platform/                  # OS/app integrations
│   │   │   │   ├── hotkeys/                   # registration/status, repeat suppression and callback errors
│   │   │   │   ├── updates/                    # updater service and meeting-aware restart checks
│   │   │   │   ├── email/                      # EmailProvider seam and SMTP transport
│   │   │   │   └── retention/                  # scheduled/on-demand recording and meeting cleanup
│   │   │   ├── jobs/                       # counted job deletion and single-use preview tokens
│   │   │   │   ├── applications/           # resumes-pack import: map, merge, draft; application-import.ts is the facade
│   │   │   │   │   ├── import/             # list, preview (+ typed fields/session) and apply (+ values)
│   │   │   │   │   └── source/             # read-only edge to the resumes project: refresh, files, validation, config
│   │   │   │   ├── resume/                 # job resume validation, bounded PDF/DOCX import
│   │   │   │   └── memory/                 # memory rewrites (generate), review workflow (review), prompts
│   │   │   ├── history/                    # grounded ask-your-history retrieval and answers
│   │   │   │   └── live/                   # live same-job evidence: hits, excerpts, deadline session, read-only worker
│   │   │   ├── audio-store/                # WAV recording of accepted capture audio
│   │   │   └── screen-capture/             # display choice, one-shot screenshot and encoding
│   │   ├── db/                             # async open/backup/migrations and SQLite helpers
│   │   │   ├── repos/                      # entity repositories and all SQL strings
│   │   │   │   ├── job/                    # job-owned content: saved resume (v11), glossary, application links (v13), deletion
│   │   │   │   │   └── memory/             # approved memory, per-meeting proposals and their schema
│   │   │   │   ├── history/                # transcript search and bounded live-evidence reads (FTS), summary index schema
│   │   │   │   └── meeting/                # meeting row, creation, grounding, context and historical slide readers
│   │   │   └── testing/                    # test-only SQLite adapter (sqlite-test-database.ts)
│   │   └── config/                         # settings, secrets and exhaustive settings schema
│   ├── preload/                            # typed contextBridge API
│   ├── renderer/
│   │   ├── public/                         # unbundled AudioWorklet and static assets
│   │   └── src/
│   │       ├── app/                        # library React application
│   │       │   ├── shell/                  # app header (identity, page tabs, meeting status, overlay toggle)
│   │       │   ├── controls/               # Switch, FieldRow, Badge, KeyBadge — the library's small control components
│   │       │   ├── pages/                  # route/page components
│   │       │   ├── meeting/                # saved-meeting record pieces: header/actions, transcript panel, speakers, suggestions
│   │       │   ├── mock-interview/         # practice results table and mock-interview hook
│   │       │   ├── jobs/                   # job detail tabs
│   │       │   │   ├── applications/       # New job from / refresh from application: picker, preview, preview-format
│   │       │   │   ├── deletion/           # counted job-delete dialog and its wording
│   │       │   │   ├── memory/             # approved-memory editor, proposal review, context-size meter
│   │       │   │   └── resume/             # job resume editor, draft rules, Unsorted placeholder
│   │       │   ├── settings/
│   │       │   │   ├── sections/           # one component per Settings section + section index (+ pure hotkey/update status)
│   │       │   │   │   └── InterviewProfileSection.tsx # the one plain-text Interview profile editor
│   │       │   │   └── frame/              # section list, index, pane, card, useSettingsDraft + patch/validation, save bar
│   │       │   │       └── paging/         # pure page order + useSettingsPager
│   │       │   └── styles/                 # tokens → base/controls → shell/transcript/pages/settings; overlay-* layers
│   │       ├── interviewer-app/            # small offline-speech/caption/share/control entry
│   │       ├── overlay-app/                # separate small overlay bundle
│   │       │   ├── shell/                  # session composition, layout, header, status, preferences
│   │       │   │   └── navigation/         # workspace reducer, local shortcuts, rail, compose handshake
│   │       │   ├── suggestions/            # answer surface, history coordination, manual requests
│   │       │   ├── workspaces/             # frame + secondary views (Screen, Transcript, Context); composer/ (Ask)
│   │       │   ├── controls/               # OverlayButton, OverlayTextArea, OpenSanasButton, overlay icons
│   │       │   ├── layout/                 # opacity, divider ratio/drag, resize grips
│   │       │   └── capture/                # capture action, status subscription and composer attachment state
│   │       ├── audio/                      # mic/loopback capture and worklet bridge
│   │       ├── lib/                        # pure shared renderer helpers (incl. overlay-workspaces.ts: workspace names + local shortcut table)
│   │       │   ├── meeting/                # meeting/context state and hooks (start-selection.ts: Start choices and options; useJobHasResume: Live's Interview default)
│   │       │   ├── navigation/             # pure orientation-aware tab arrow/Home/End rule (JobTabs, OverlayNavigation)
│   │       │   └── suggestions/            # safe suggestion rendering and history reducer
│   │       ├── dev/                        # typed browser-preview bridge mocks
│   │       │   └── jobs/               # job mocks: deletion, application import, memory
│   │       └── env.d.ts                    # Vite client types
│   └── shared/                              # cross-process IPC and domain contracts
│       ├── filler-marker.ts                # ⟨…⟩ improvised-answer marker: constants, split and strip
│       ├── interview-profile.ts            # Interview profile text limit
│       ├── jobs/                           # renderer-safe job contracts: applications, import baseline, deletion, limits
│       ├── mock-interview/                 # typed setup/state/result IPC contracts
│       ├── presentation/                   # historical slide and timeline contracts (read-only)
│       ├── live-controls/                  # context, admission, suggestion metadata, capture, visibility ack and readable-suggestion contracts
│       ├── hotkeys/                        # global shortcut actions and registration status
│       └── updates/                        # sanitized updater snapshots
├── scripts/                                # repository, release and owner-operation tooling
│   ├── release/                            # version, package, publish, install and smoke tooling
│   ├── eval/                               # paid prompt evals (owner-run .ps1 + vitest-run .eval.ts)
│   ├── rehearsal/                        # runner, credentials and fixture rendering
│   │   ├── scenarios/                    # scripted/audio JSON
│   │   ├── trials/                       # matched-profile compare and copied-log latency summary
│   │   └── fixtures/                     # standup.png only
│   └── owner/                              # redacted owner operation dispatch/logging
├── .github/
│   ├── workflows/                          # CI and manual release workflows
│   └── actions/                            # shared local actions (Node/download-cache setup)
├── docs/                                   # living docs and Docket items
├── vite.renderer.config.ts                 # browser-only renderer preview
├── vitest.config.ts                        # test runner; @shared alias only
└── STRUCTURE.md
```

**Enforced homes:**

- `src/main/rehearsal/` — isolated dispatch/composition; no ordinary startup policy.
- `src/main/rehearsal/scenario/` — scenario validation, assertions and bounded content rubrics.
- `src/main/rehearsal/outcomes/` — scripted providers and request/span correlation.
- `src/main/rehearsal/runner/` — options, observer evidence, step execution, clock/audio pump and final checks/report; `comparison.ts` is the matched Full/Smart trial driver (production request builder + runner + `RehearsalAssistant`), launched only by `scripts/rehearsal/trials/compare.*`.
- `src/main/rehearsal/audio/` — PCM replay and socket fault injection.
- `src/main/rehearsal/screens/` — fixture display, capture verification and coordinate geometry.
- `scripts/eval/` — paid prompt evals: `topic-switch.ps1` (old vs new prompt builders on an invented fixture; `-DryRun` is free) and `.eval.ts`
- `scripts/rehearsal/` — owner runner, credentials and offline fixture rendering.
- `scripts/rehearsal/trials/` — matched-profile and latency-summary owner tools: `compare.ps1`/`compare.mjs` (bundle and run `src/main/rehearsal/runner/comparison.ts`), `summarize.ps1`/`summarize.mjs` (copied-log stage percentiles) and `summarize.test.ts`, and `history-latency.ps1`/`history-latency.mjs` (live-history retrieval latency); each `.ps1` dot-sources `../owner-run.ps1` from `$PSScriptRoot` and runs from any cwd.
- `scripts/rehearsal/scenarios/` — versioned scripted/audio scenarios.
- `scripts/rehearsal/fixtures/` — the rehearsal-only standup screen.
- `src/main/services/platform/` — email, updates, retention and global-hotkey integrations.
- `src/main/services/turns/transcript-format.ts` — canonical main-side transcript labels/windowing.

- `src/main/services/mock-interview/` — one product engine, plan validation, interviewer seam consumer,
  session lifecycle, bundled JSON plans/PNG fixtures and shared live-turn result correlation.
- `src/main/services/mock-interview/turns/` — interviewer consumer, serialized engine, `answer-wait.ts` (candidate-answer silence/idle-prompt clock), session lifecycle, and the result evidence/report builders (`evidence.ts`, `report.ts`; nothing in `turns/` imports the parent).
- `src/main/services/mock-interview/plans/` — bundled JSON validated by pure validatePlan in the production catalog.
- `src/main/services/mock-interview/fixtures/` — canonical screen PNGs shared by product and rehearsal scenarios.
- `src/main/services/mock-interview/shortcuts.ts` — mock-only shortcut registration/release.
- `src/main/windows/interviewer-window.ts` — separate window; restricts broadcasts to mock state.
- `src/main/db/repos/practice.ts` — v8 migration SQL, result persistence and practice listing.
- `src/main/ipc/mock-interview/` — validated mock commands (`mock-interview.ts` + `-validation`); speech ACKs require the output sender.
- `src/main/ipc/live-controls/` — context, admission, capture and visibility-ack IPC (`live-controls.ts` + `-validation`).
- `src/main/ipc/screen-capture/` — screen-capture IPC (`screen-capture.ts` + `-validation`).
- `src/renderer/src/interviewer-app/` — local OS speech, captions and shares; no provider/network calls.
- `src/renderer/src/lib/meeting/start-captured-meeting.ts` — shared capture acquisition/adoption/cleanup.
- `src/shared/mock-interview/` — cross-process mock contracts.

- `src/main/lifecycle/` — userData identity, capped/redacted main logging and normal startup wiring (`window-policy.ts`: quit when the main window closes, hide the overlay when a meeting goes idle); normal startup is not loaded by smoke
- `src/main/diagnostics/` — isolated, headless packaged diagnostics used by `--smoke`
- `src/main/windows/` — BrowserWindow builders and the main → all-windows broadcast (`app-window.ts`: `createAppWindow`/`loadAppPage`, the only definition for app-page windows — their webPreferences and dev-URL vs file loading (rehearsal fixture display excepted); `overlay-bounds.ts`: pure on-screen fitting of saved overlay bounds; `main-window.ts`: create or reveal — restore/show/focus, never reload, reports close through `onMainWindowClosed`; `overlay-window.ts`: show/hide/toggle; `window-chrome.ts`: the hidden title bar + caption-button colours mirrored from tokens.css)
- `src/main/ipc/` — typed IPC handlers; validate ingress and delegate, with no business logic (`windows.ts`: overlay toggle/resize/ghost, compose handshake and the parameterless Open Sanas; `validate.ts` also owns `requireMeetingStart`, the Start options check; `presentation-history.ts`: read-only historical slide markers; `hotkeys.ts`: global-shortcut status; `audio-chunk.ts`: the contained audio-chunk `.on` listener)
- `src/main/` — process entry (`index.ts`, normal vs `--smoke` dispatch) and the display-media loopback handler (`system-audio.ts`)
- `src/main/services/` — main-process services and provider seams
- `src/main/services/stt/` — the swappable STT seam (`index.ts`, `types.ts`); `keyterm-budget.ts` holds Deepgram's keyterm limits so callers pass an ordered list and never a vendor budget; `endpointing.ts` the shared endpointing silence the scripted STT mirrors
- `src/main/services/stt/deepgram/` — the Deepgram implementation behind the seam: provider and batch (`deepgram.ts`), socket lifecycle and PCM-anchored clock (`deepgram-session.ts`, `DeepgramSession`), stall watchdog (`deepgram-watchdog.ts`), stream URL (`deepgram-stream-url.ts`) and message normalization (`deepgram-events.ts`); only `stt/index.ts` (and the rehearsal runner's dynamic import) reach it
- `src/main/services/assistant/classifier-verdict.ts` — pure tolerant-but-conservative verdict parsing, canonical `formatVerdict`, `isAcceptedVerdict` and the one `CLASSIFIER_FAILURE_REASONS` list and content-free malformed shapes; `claude-usage.ts` extracts Anthropic usage into `ProviderUsage` (missing = unknown); `provider-evidence.ts` holds the provider-neutral `reportUsage`/`reportTiming`, and `provider-error.ts` the neutral failure category a provider tags on its transport errors (failure-diagnostics reads it, never vendor class names)
- `src/main/services/assistant/failure-diagnostics.ts` — allowlists provider failure metadata for classifier diagnostics (category incl. `connection`, error class `errorName`, status, request ID, model, elapsed); the assistance coordinator owns the suspension timer and publishes availability through MeetingState
- `src/main/ipc/jobs/resume/` — `jobs.getResume`/`setResume` (validated by `validateResume`) and `resume-import.ts`, the native PDF/DOCX picker returning an unsaved draft; the renderer never supplies a filesystem path
- `src/renderer/src/lib/meeting/job-choices.ts` — Live picker choices (`startableJobs` drops the Unsorted bucket via `isUnsortedJob`), the remembered job (`rememberedJob`/`rememberJob`) and `selectionAfterReload`
- `src/renderer/src/lib/meeting/start-selection.ts` — the Interview default/override rule and the Start options
- `src/renderer/src/lib/meeting/useJobHasResume.ts` — whether the selected job has a saved resume (Live's Interview default), stale-reply safe
- `src/main/services/turns/` — pure turn assembly and identity-role types; no I/O or timers; `latest-question.ts` picks the question Answer now answers
- `src/main/services/assistant/` — the swappable assistant seam and shared answer/classification logic
- `src/main/services/assistant/answer-context/` — `automatic-turn.ts` owns the neutral automatic focus block and `TriggeringTurn`; answer prompt context: current-exchange/background window split, anchor text (`anchor.ts`: `CURRENT_QUESTION_RULE`, `ANCHOR_REMINDER`, `LatestQuestion`), told stories, `ShownLedger` (`shown-ledger.ts`: the one place a shown suggestion is routed into the recent/told/coach memories, used by `LiveSession` and the eval), and `topic-switch-fixture.ts` (invented data + window builder; scoring lives in `scripts/eval/carried-terms.ts`)
- `src/main/services/assistant/coach/` — next-point eligibility policy and coach prompt construction
- `src/main/services/assistant/live-controls/` — typed, detail, audience and screen-capture request instructions
- `src/main/services/meetings/` — meeting lifecycle/STT/audio orchestration plus meeting-level facades
- `src/main/services/meetings/assist/` (root: `live-session.ts` assembly, `meeting-prompts.ts`, `outcomes.ts`; code lives in the four homes below) — per-meeting prompt/grounding state, manual and screen-capture admission, in-memory composer screen drafts (`capture-drafts.ts`), automatic coordination (`question-ledger.ts` carries uncovered stacked questions into one suggestion; `speculative-answer.ts` owns the one unpublished answer started alongside the classifier and its promote/discard rule; `promptMismatchCategories` in `suggestion-requests.ts` decides when two requests are the same prompt (empty result), comparing every field except an explicit short list; `observation/run-observation.ts` also owns `EffectiveProfile`, the full/smart/points policy a run used) and suggestion execution (`latency.ts` `LatencyTracker` + `observeLatency()` (owns both subscriptions) correlate diagnostics and run observations into bounded, allowlisted stage-timing records, `latency-summary.ts` `summarizeLatency` reports them; `suggestion-runner.ts` owns lanes, deadline and persistence; `run-publication.ts` the per-run held-text and publish gate)
- `src/main/services/meetings/observation/` — the one home for observation: `observer-bus.ts` (shared typed pub/sub; a throwing listener is dropped, never policy), `meeting-observation.ts` (transcript/signal/state; window policy and mock-interview consume it), `run-observation.ts` (runner events plus `EffectiveProfile`), `diagnostics.ts` (coordinator decisions plus the rehearsal-only observer). They stay separate streams with their own payloads and consumers and share only the bus and the rule that observation never changes behaviour; payload types come from `assist/`, which emits into them
- `src/main/services/meetings/assist/automatic/` — the automatic coordinator (`live-assistance.ts`), `question-ledger.ts` and `speculative-answer.ts`
- `src/main/services/meetings/assist/manual/` — manual and screen-capture admission (`manual-requests.ts`, `capture-requests.ts`) and `capture-drafts.ts`
- `src/main/services/meetings/assist/suggestion/` — `suggestion-requests.ts` (request building, prompt-mismatch categories), `suggestion-in-flight.ts`, `suggestion-runner.ts`, `run-publication.ts`
- `src/main/services/meetings/assist/latency/` — `latency.ts` tracker/observer and `latency-summary.ts`
- `src/main/services/meetings/assist/automatic/classifier/` — `classifier-breaker.ts`: the consecutive-failure circuit breaker (count, suspend, recover, throttled failure log) the coordinator asks about the turn classifier
- `src/main/services/meetings/assist/automatic/testing/` — test-only fake-clock harness shared by the live-assistance suites
- `src/main/services/meetings/capture/` — AUDIO capture-side identity and capture-health policy (screen capture lives in `services/screen-capture/`)
- `src/main/services/meetings/context/` — pure preparation followed by commit/publication of live context changes; `meeting-keyterms.ts` builds the STT hints (glossary plus resume/profile terms) for streaming and batch
- `src/main/services/jobs/resume/` — job resume: ingress validation (`resume.ts`), bounded PDF/DOCX parsing (`import-file.ts`); (term extraction lives beside `candidate-data.ts` in `context/candidate-keyterms.ts`: `candidateKeyterms`, shared by resume and profile)
- `src/main/services/jobs/memory/` — job memory, and the one owner of its review rules: `source.ts` (eligible source, fingerprint, `proposalIsCurrent`), `generate.ts` (serialized per-job rewrites against the last approved revision; skip-if-unchanged and the stale/failed/pending settling; `enqueueMemory` after summaries), `review.ts` (get/save/approve/dismiss/retry and the view status rules such as stale and failed; IPC only validates shapes) and `prompts.ts`
- `src/main/db/repos/job/memory/` — persistence and one compare-and-set only: `approved.ts` (owner-approved text, 3,000-char cap, revisioned), `proposals.ts` (plain reads/writes plus `markApprovedIf`, the single-transaction approval) and `schema.ts`; no staleness, skip or retry rules. `repos/job/eligible-meeting.ts` is the one SQL predicate for an eligible meeting (ended, not practice, not Unsorted), shared with `repos/history/live.ts`
- `src/main/services/history/live/` — live same-job evidence: `policy.ts` (query specificity), `hits.ts` (ranking: interleave transcript and summary indexes, dedup, neighbour expansion, prompt kind labels), `excerpts.ts` (strict 2,400-char rendering), `session.ts` (frozen, deadline-bounded evidence), `worker-client.ts`/`worker.ts` (read-only worker thread, a separate main build entry running the same `hits.ts` on its own connection); assistance consumes it only through the `EvidenceHandle` it defines in `meetings/assist/automatic/live-assistance.ts`
- `src/main/db/repos/history/` — bounded reads only: `transcripts.ts` (ranked transcript search, `searchSegments`), `live.ts` (transcript/summary/neighbour reads that take a connection so the worker can run them), `summary-schema.ts` (summary FTS index); no ranking, dedup or prompt labelling
- `src/renderer/src/app/meeting/` — pieces of the saved-meeting record: `MeetingRecordHeader` (title and summarize/email/export/delete actions), `TranscriptPanel` (transcript with slide markers plus `SpeakerEditor`), `MeetingSuggestionsTab` and `usePresentationHistory`; `pages/MeetingView` loads the record and composes them with the filing, summary and context cards
- `src/renderer/src/app/mock-interview/` — `MockResults` (practice results table) and `useMockInterview` (setup, job/plan choice, mock state, past sessions, mic capture); `pages/MockInterviewPage` is layout and wiring
- `src/renderer/src/app/jobs/memory/` — `JobMemory` composes `ContextSizeMeter`, `ApprovedMemoryEditor` (saved text and explicit save) and `MemoryProposalReview` (oldest-first proposal approve/dismiss/regenerate); `useJobMemory` owns the state, `context-size.ts` the meter maths
- `src/renderer/src/app/jobs/resume/` — `JobResume` (saved resume with its own Save resume), `ResumeDraftEditor` (paste/import/preview), `resume-draft.ts` (pure draft rules) and `ResumeUnavailable` (the Unsorted bucket takes no resume)
- `src/renderer/src/dev/jobs/` — browser-preview job mocks: `mock-job-deletion.ts`, `mock-job-applications.ts` and `mock-job-memory.ts`; `dev/mock-api.ts` composes them
- `src/main/services/meetings/context/candidate-data.ts` (and `candidate-keyterms.ts`: STT term extraction/interleave for resume and profile) — neutral escaping and delimited prompt framing for resume (`candidateFacts`) and Interview profile (`interviewProfileFacts`); so resume code and the profile never import each other
- `src/main/services/meetings/context/meeting-facts.ts` — combines a `MeetingGrounding` into the candidate-facts block (resume first); `profile.ts` — `interviewProfileSnapshot`, Start selection of the Settings profile; `start-request.ts` — `StartRequest` (the renderer's `MeetingStartOptions` plus main-only `practice`); `start-grounding.ts` — `resolveStartGrounding`, the selected job's saved resume (none for Unsorted) plus the profile, resolved inside serialized Start for Live and Mock
- `src/main/services/meetings/presentation/` — historical slide-marker formatting for summaries (presentation mode retired 2026-11-04)
- `src/main/services/meetings/status/` — live-meeting identity, post-processing guards (both expose `on…Change` signals via `change-signal.ts`, so the updates service re-broadcasts without polling) and `filing.ts` (historical job filing; refuses a live meeting)
- `src/main/services/meetings/summary/` — meeting summaries, structured output handling and summary email
- `src/main/services/meetings/rediarize/` — batch re-diarization and speaker identity/name carry-over
- `src/main/services/meetings/merge/` — split-recording merge planning and application
- `src/main/services/meetings/recovery/` — startup repair of meetings left open by an earlier process
- `src/main/services/platform/hotkeys/` — global shortcut registration/status, repeat suppression and callback containment
- `src/main/services/platform/updates/` — electron-updater integration and restart eligibility checks
- `src/main/services/platform/email/` — the email provider seam and SMTP implementation
- `src/main/services/platform/retention/` — recording/meeting cleanup timers, preview and execution
- `src/main/services/history/` — FTS retrieval and grounded ask-your-history answers
- `src/main/services/audio-store/` — WAV recording for accepted capture audio
- `src/main/services/screen-capture/` — display selection, one-shot desktop capture, image sizing/encoding; no meeting or provider policy
- `src/main/db/` — database connection lifecycle, consistent pre-upgrade backup, migrations and SQLite helpers (`read-only.ts`: `openReadOnlyConnection`, the history worker's read-only connection)
- `src/main/db/testing/` — `sqlite-test-database.ts`, the local SQLite transaction adapter shared by repository tests (it does not certify Electron ABI packaging), and `latency-fixture.ts`, the rehearsal-only synthetic history seeding
- `src/main/db/repos/meeting/` — the meeting repos: `meetings.ts` (row), `meeting-columns.ts` (the one meeting column projection: no resume/profile text, `interview_profile_used` computed in SQL), `meeting-create.ts` (`createMeeting(jobId, title, MeetingCreateInput)`, the one creation transaction; the input is main-resolved and carries the profile snapshot and the Start context, saved as revision 0), `meeting-grounding.ts` (`getMeetingGrounding(id)`: `{ resume, interviewProfile, hasBiography }`, the only read of both snapshots), `meeting-resume-schema.ts` / `meeting-interview-profile-schema.ts` (append-only v9/v10 SQL; their original guards are superseded by v12), `meeting-snapshot-clear-schema.ts` (v12: the live immutability triggers on the resume/profile snapshot columns, which allow a clear-to-empty only while a `meeting_snapshot_clear` guard row exists; `moveMeetingToJob` in `meetings.ts` is the only sanctioned clearer, on a job change), `meeting-context.ts` (text-only context revisions, `hasMeetingContext`, merge `moveContextHistory`), `meeting-presentation.ts` (read-only historical slides: `getPresentationHistory`, `hasLegacySlides`)
- `src/main/db/repos/job/` — job-owned content: `job-resume.ts` (`getJobResume`/`setJobResume`, one optional row per job) with its append-only v11 schema (`job-resume-schema.ts`); `glossary.ts` (the glossary SQL, moved out of `repos/jobs.ts`); `applications.ts` (the job↔resumes-application link, `LocalJobState`, and the one-transaction create/refresh writes) with its v13 schema (`application-schema.ts`: `job_applications` plus the `jobs_delete_guard` trigger); `job-deletion.ts` (per-table counts, the job/meeting snapshot, `isProtectedJob`, and the final `deleteJobRow`)
- `src/main/services/jobs/` — job deletion (`deletion.ts`: counted preview, SQLite backup, per-meeting removal through `meetings/remove.ts`, then the job row) and `preview-tokens.ts`, the main-owned single-use confirmation tokens shared by deletion and application import
- `src/main/services/jobs/applications/` — importing a job from a resumes interview pack: `application-import.ts` is the thin facade over `import/` (`listing.ts` row projection, `row-status.ts` linked-row status, `preview.ts` create/refresh preview, `preview-fields.ts` typed field values, `preview-session.ts` token payload + pack reload, `apply.ts` confirmed apply, `apply-values.ts` create-value and name resolution); `map-pack.ts` maps a validated pack to job values (name, glossary normalization); `merge-preview.ts` is the pure three-way refresh comparison; `draft-fields.ts` is draft-at-import (create only) through `AssistantProvider`
- `src/main/services/jobs/applications/source/` — the read-only edge to the resumes project: `refresh-runner.ts` (runs its pack CLI), `pack-files.ts` (bounded, contained listing/reading of `.json` packs), `validate-pack.ts` (schema v1 + limits + `packFingerprint`) and `source-config.ts` (re-validated `resumesRoot`/node settings)
- `src/main/ipc/jobs/` — jobs, glossary, deletion and application IPC (`jobs.ts`, `deletion.ts`, `applications.ts`, `validate.ts`, and `resume/` for the job resume); the privileged channels answer only the library window (`requireLibrarySender`)
- `src/shared/jobs/` — renderer-safe job contracts and limits: `applications.ts` (pack/preview/apply types; preview values are typed, never display text), `unsorted.ts` (`isUnsortedJob`, the reserved bucket name and `reservedNameError`: the one Unsorted identity), `application-stage.ts` (`stageCapabilities`: the one closed-stage policy — visible, create, refresh, archive — used by listing, preview, apply, row-status and the dev mock), `import-baseline.ts` (storage-independent `ImportBaseline`/`LocalValues`), `deletion.ts`, `limits.ts` (job, glossary and `JOB_PERSONA_MAX_CHARS` limits) and `source-settings.ts` (resumes settings defaults/validation)
- `src/shared/filler-marker.ts` — `FILLER_OPEN`/`FILLER_CLOSE` for prompts, `splitFiller`/`stripFillerMarkers` for rendering; `src/shared/interview-profile.ts` — the profile text limit
- `src/renderer/src/app/settings/sections/InterviewProfileSection.tsx` — the one plain-text Interview profile editor; the Settings draft/pager/save flow owns editing state
- `src/main/db/repos/` — per-entity repositories (incl. the screen-answer storage codec `manual-kind.ts`); the only place SQL strings live
- `src/main/config/` — settings/secrets persistence and exhaustive settings validation
- `src/preload/` — typed contextBridge surface exposed to renderers
- `src/renderer/src/app/` — library UI root and entry point
- `src/renderer/src/app/shell/` — the library window frame: `AppHeader` (also the window title bar — drag region, see GOTCHAS), the `Page` union + `NAV` table (`pages.ts`) and the pure meeting-status wording
- `src/renderer/src/app/controls/` — small shared library controls (`Switch`, `FieldRow`, `Badge`, `KeyBadge`); styles live in `styles/controls.css`
- `src/renderer/src/app/pages/` — one component per library route/page; `SettingsPage` is layout and wiring only (its state is `useSettingsDraft`)
- `src/renderer/src/app/jobs/` — `JobOverview` (name, context, glossary), `JobEmail` (recipient) and `JobMeetings` (history/merge); resume and memory live in `jobs/resume/` and `jobs/memory/`. `JobTabs` owns tab/panel IDs, keyboard focus and mounted panels from a name/render table. `pages/JobDetail` owns load, the meetings list (reloaded via `JobMeetings`' `onMerged`), shared draft/save, composition and meeting drill-in; the tabs stay mounted (hidden) behind an open meeting so drafts survive. `job-draft.ts` holds the pure job-draft rules (unsaved-edit check before a refresh)
- `src/renderer/src/app/jobs/applications/` — New job from application / Refresh from application: `ApplicationPicker` (rows and statuses via `picker-rows.ts`), `ApplicationPreview` (create form or per-field refresh review, conflicts defaulting to Keep Sanas), `preview-format.ts` (field labels and display text for the typed preview values), `apply-request.ts` (builds the apply request) and `useApplicationListing.ts` (the listing hook)
- `src/renderer/src/app/jobs/deletion/` — `JobDeleteDialog` (exact-count confirmation, default button Cancel) and `deletion-copy.ts` (pure count wording)
- `src/renderer/src/app/settings/` — only the cross-section tests (`settings-pages.test.tsx`, `settings-controls.test.tsx`); everything else is in the folders below
- `src/renderer/src/app/settings/sections/` — one component per Settings section, including independent update state, plus pure status wording (`hotkey-status.ts`, `update-status.ts`); `SettingsSectionPage.tsx` is the section index that renders the selected section
- `src/renderer/src/app/settings/frame/` — what every section shares: the section list (`settings-sections.ts`), card (`SettingsSection`), the index (`SettingsNav`, Up/Down), the animated scrolling pane (`SettingsPane`, owner of `SETTINGS_PANE_ID`), the draft state (`useSettingsDraft`: load, externally changed keys, save state machine), the pure patch/dirty/validation logic and page-ownership lists (`settings-draft.ts`) and the save bar
- `src/renderer/src/app/settings/frame/paging/` — the pager: pure page order (`page-order.ts`: `ORDER`, `selectPage`, `stepPage`, `pageDirection`) and the thin React state wrapper `useSettingsPager`
- `src/renderer/src/app/styles/` — layered shared stylesheet; no per-page stylesheets. `tokens.css` is shared by both windows; the library imports `index.css` (base → controls → shell → transcript → pages → settings), the overlay imports `overlay-app/overlay.css` (tokens → controls → `overlay-controls` → `overlay-shell` → `overlay-panels` → `overlay-suggestions`)
- `src/renderer/src/overlay-app/` — deliberately small, separate overlay bundle; `no-native-popups.test.ts` scans every file under it for native tooltip/select/dialog UI that would leak into screen shares
- `src/renderer/src/overlay-app/shell/` — `OverlaySession` (composes every controller once), `OverlayShell` layout, header, persistent status, preferences popover, window state, Answer every question
- `src/renderer/src/overlay-app/shell/navigation/` — pure workspace reducer, local shortcut table/dispatch, the rail, and the compose readiness/focus handshake
- `src/renderer/src/overlay-app/suggestions/` — the answer surface (full and preview), history/reading coordination and manual-request (detail/audience) policy
- `src/renderer/src/overlay-app/workspaces/` — the frame that keeps secondary views mounted plus one file per view (`OverlayCapturePanel`, `OverlayTranscript`, `OverlayContext`); `composer/` (Ask: draft state, submission, view) is the only subfolder, kept because it has several files
- `src/renderer/src/overlay-app/controls/` — the overlay's small control wrappers (button variants, in-DOM `OverlayTip` tooltip, labelled textarea, Open Sanas) and local icons; not a general component framework
- `src/renderer/src/overlay-app/layout/` — overlay opacity and divider-ratio persistence, divider drag/measurement, and the three resize grips
- `src/renderer/src/overlay-app/capture/` — Capture screen action, capture status subscription/helpers and the composer's screen-attachment state (hooks only; the Screen view lives in `workspaces/`)
- `src/renderer/src/audio/` — renderer capture and AudioWorklet downsampling
- `src/renderer/src/lib/` — pure presentation helpers shared across renderer pages and bundles (`overlay-workspaces.ts`: workspace names and the local shortcut table shared by the overlay and Settings → Hotkeys)
- `src/renderer/src/lib/meeting/` — meeting and context reducers/hooks; `meeting-context-draft.ts` + `useMeetingContextDraft.ts` are the draft/apply/reload/conflict logic shared by the Live page's `MeetingContextEditor` and the overlay's Context; `start-selection.ts` also builds the Start options (`meetingStartOptions`) and the pre-Start context draft rule
- `src/renderer/src/lib/navigation/` — `next-tab-index.ts` and colocated tests: pure orientation-aware wrapping arrows/Home/End rule shared by JobTabs and OverlayNavigation. Settings keeps its distinct clamped, arrow-only page navigation.
- `src/renderer/src/lib/suggestions/` — text-safe compact/detail renderers and live history state (`FillerText` renders the ⟨…⟩ improvised-answer marker; `src/shared/filler-marker.ts` splits/strips it)
- `src/renderer/src/dev/` — browser-preview implementation of the typed preload bridge: `mock-api.ts` assembles it, `mock-fixtures.ts` holds the static sample data, `mock-live-meeting.ts` the scripted live meeting; `overlay-scenarios.ts` holds the deterministic overlay preview states (`overlay.html?scenario=<name>`) driven through `mockDriver`
- `src/renderer/public/` — AudioWorklet processors and other unbundled assets
- `src/shared/` — types shared by main, preload and renderer
- `src/shared/presentation/` — historical slide/event/history contracts and timeline ordering (read-only since 2026-11-04)
- `src/shared/meeting-start.ts` — `MeetingStartOptions` (`interview?`, `meetingContext?`); `src/shared/meeting-context.ts` — the 20,000-character context limit and `requireMeetingContextText`, the one validator Start, Apply and rehearsal scenarios share
- `src/shared/hotkeys/` — global shortcut action and registration-status contracts
- `src/shared/live-controls/` — meeting-context, manual-admission, suggestion metadata and screen-capture contracts; `visibility.ts` is the renderer-to-main `SuggestionVisibility` acknowledgement (a commit/frame proxy, not paint), and `readable-suggestion.ts` (`NO_SUGGESTION`, `isNoSuggestion`, `hasReadableText`) is the one definition of a readable suggestion, used by main's first-readable stamp and the overlay's `useSuggestionVisibilityAck`
- `src/shared/updates/` — renderer-safe update state and operation contracts
- `scripts/` — repository tooling plus release and owner-operation entry points
- `scripts/release/` — versioning, asset/package checks, publication, installation and packaged smoke
- `scripts/owner/` — redacted logs and owner-only release operation dispatch
- `.github/workflows/` — CI and manual release workflows
- `.github/actions/` — shared local workflow actions, including Node/download-cache setup

Tests are colocated `*.test.ts`/`*.test.tsx` files (Vitest, `npm test`) beside the modules they
cover. Coverage includes provider normalization, turn/assistant policy, live-control
state/admission/grounding, historical slide readers, meeting lifecycle and post-processing, startup/backup/smoke/update wiring,
IPC validation, renderer reducers/renderers, shared timeline/format helpers, window behavior, and
release scripts. Repository SQL tests use the local Node SQLite adapter; Electron-ABI diagnostics remain
a separate check, rather than ordinary Vitest loading of `better-sqlite3`.

Deliberately _not_ homes: the repository root and `src/renderer/src/` itself. `src/main/` is a home
only for the process entry (`index.ts`) and the display-media handler (`system-audio.ts`); new
main-process code belongs in a responsibility folder above, not beside them.

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
  `live-assistance` coordinates automatic work; `speculative-answer` decides whether an early
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

- `renderer/src/lib/` is broad (loose helpers beside `meeting/`, `suggestions/`) and
  `lib/meeting/` has a high file fan-out; split by responsibility before either grows again.
- The overlay's CSS layers (`overlay-controls/-shell/-panels/-suggestions.css`) live in
  `app/styles/` beside the library's, so the shared folder mixes two bundles; `.workspace-body` /
  `.workspace-actions` sit in `overlay-panels.css` while the workspace frame is in `overlay-shell.css`.
- `services/assistant/` has 15 entries; a `classifier/` subfolder for `classifier.ts`,
  `classifier-verdict.ts` and `failure-diagnostics.ts` is the natural next split.
- The provider-neutral seam still carries Anthropic vocabulary: `ProviderTiming`'s `'policy'` variant
  (`assistant/types.ts`) names Anthropic's `effort` levels and `thinking` modes (`between_tools`). Widen
  it to opaque provider-tagged strings when a second `AssistantProvider` arrives; until then
  `claude.ts` computes one `wirePolicy()` per request for both the body and the event.
- `services/meetings/` and `services/assistant/` are both broad (many files plus subfolders);
  group by lifecycle vs. policy before adding more siblings. `meetings/assist/` is split into automatic/, manual/, suggestion/ and latency/ (dk-c0cd0363).
- `shell/` and `workspaces/` are coupled through `OverlaySessionModel`: workspaces take the whole
  session, and `OverlaySession` imports the composer hook. Narrow the props per workspace if the
  session grows.
- `services/` has 10 children (the new `jobs/` took it from 9 after grouping platform integrations
  and moving transcript formatting into `turns/`); `meetings/` breadth remains tracked by dk-bd2e1ebf.
- `src/shared/` (21 entries) and `src/main/ipc/` exceed the 10-entry breadth guideline; the loose
  `shared/*.ts` contracts group by domain the way `shared/jobs/` now does (`ipc/job-resume/` moved
  under `ipc/jobs/resume/`; the mock-interview, live-controls and screen-capture IPC pairs now sit in `ipc/<feature>/`, dk-cb03df74).
- `app/settings/sections/` now holds 13 code files (Applications joined); group related sections
  before adding more.
- Screen answers are stored as `typed` plus a `[Screen capture]` request-text marker because the
  `suggestions` CHECK constraint has no `capture` kind. A real `capture` kind needs a table rebuild
  migration; the codec in `db/repos/manual-kind.ts` is the only place to change.

- `AssistRequest.model`, `AssistRequest.effort` and `AssistRequest.workspaceId` map closely to
  Anthropic-specific knobs, and the Claude provider derives a per-model "thinking off" value from a short `maxTokens`
  (`SHORT_BUDGET_MAX_TOKENS` in claude.ts), also Anthropic-specific. A second provider will need its own model settings and interpretation.
- Live assistance and summaries select `AssistantProvider` through `services/assistant/provider.ts`.
  Normal startup selects Claude; explicit rehearsal startup may install a canned provider.
- SMTP credentials use the same plain local-settings trust model as API keys. `safeStorage` encryption
  for all secrets should be one future change if required.
- `EmailProvider.send(config, mail)` takes an SMTP-shaped configuration. A non-SMTP transport would
  change the seam and its caller; do not abstract it before a second transport exists.

## Resume (saved on the job, snapshotted on the meeting)

- `shared/meeting-resume.ts` owns the text/name contract and limits (used for both the job's saved resume and the meeting snapshot).
- `db/repos/job/job-resume.ts` (+ v11 `job-resume-schema.ts`) owns the job's saved resume; `ipc/jobs/resume/` exposes get/set and `resume-import.ts`, the native PDF/DOCX picker; the renderer never supplies a filesystem path.
- `services/meetings/context/start-grounding.ts` is the one place Start reads the job resume; nothing else reads `job_resumes` for a meeting.
- `main/services/jobs/resume/import-file.ts` owns bounded local reads and offline parser lifecycle.
- `main/services/jobs/resume/` owns validation (run once, at IPC ingress), escaped candidate-fact framing and deterministic terminology extraction.
- `db/repos/meeting/meeting-resume-schema.ts` owns append-only v9 SQL and the immutable-update guard; `createMeeting` persists the text in its one transaction. The resume is not on the `Meeting` row: `getMeetingGrounding(id).resume` is the only read (`MeetingView` via `meetings.getResume`).
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
- `lib/meeting/start-selection.ts` (`interviewChecked`) shows the job-resume default unless the user chose;
  LiveMeetingPage sends only an explicit choice (undefined lets main decide) through preload/IPC.
- `MeetingView` receives `interviewProfileUsed` through the existing Meeting projection; large profile text
  stays off list/history IPC objects. Merge refuses meetings with a resume or profile, with
  recorded slides, or when more than one part has meeting context.
