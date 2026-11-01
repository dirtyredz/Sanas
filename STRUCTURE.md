# Sanas — Structure

_Code-shape map: components, responsibilities, dependencies, structural debt._
_System design lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)._

Last full review: 2026-08-27

## Status

Phases 0–3 built + most of Phase 4 (summaries, recording, reconnect, packaging).
Layout below reflects what exists.

## Layout

```
sanas/
├── src/
│   ├── main/                              # Electron main process
│   │   ├── index.ts                       # mode dispatch: normal startup vs --smoke diagnostics
│   │   ├── lifecycle/                     # userData identity, capped main log and normal application startup
│   │   ├── diagnostics/                   # isolated packaged smoke diagnostics
│   │   ├── windows/                       # BrowserWindow builders and main → all-windows broadcast
│   │   ├── ipc/                           # validated typed IPC handlers; delegate only
│   │   ├── system-audio.ts                # display-media loopback handler
│   │   ├── services/
│   │   │   ├── stt/                       # SttProvider seam, Deepgram sessions and event normalization
│   │   │   ├── turns/                     # pure completed-turn assembly
│   │   │   ├── assistant/                 # AssistantProvider seam, Claude, prompts, classifier, triggers
│   │   │   │   ├── coach/                 # next-point policy and prompts
│   │   │   │   ├── presentation/          # deck context, location hints and restricted coach prompt
│   │   │   │   └── live-controls/         # typed/detail/audience prompt instructions
│   │   │   ├── meetings/                  # live lifecycle/STT/audio orchestrator, export and removal
│   │   │   │   ├── index.ts               # lifecycle, STT wiring, audio and final persistence
│   │   │   │   ├── live-controls.ts       # context/manual/answer-mode/slide control facade
│   │   │   │   ├── assist/                # assembly, prompt state, admission, coordinator and runner
│   │   │   │   ├── capture/               # channel identity and capture health
│   │   │   │   ├── context/               # prepare/commit/publish meeting-context changes
│   │   │   │   ├── presentation/          # live cursor and historical marker formatting
│   │   │   │   ├── status/                # live meeting and post-processing guards
│   │   │   │   ├── summary/               # summary generation, output parsing and email
│   │   │   │   ├── rediarize/             # batch pass and speaker carry-over
│   │   │   │   ├── merge/                 # pure merge planning and DB apply
│   │   │   │   └── recovery/              # close rows stranded by an earlier process
│   │   │   ├── hotkeys/                   # registration/status, repeat suppression and callback errors
│   │   │   ├── updates/                    # updater service and meeting-aware restart checks
│   │   │   ├── email/                      # EmailProvider seam and SMTP transport
│   │   │   ├── retention/                  # scheduled/on-demand recording and meeting cleanup
│   │   │   ├── history/                    # grounded ask-your-history retrieval and answers
│   │   │   ├── audio-store/                # WAV recording of accepted capture audio
│   │   │   ├── screen-capture/             # display choice, one-shot screenshot and encoding
│   │   │   └── transcript-format.ts        # canonical main-side transcript formatting/windowing
│   │   ├── db/                             # async open/backup/migrations and SQLite helpers
│   │   │   └── repos/                      # entity repositories and all SQL strings
│   │   └── config/                         # settings, secrets and exhaustive settings schema
│   ├── preload/                            # typed contextBridge API
│   ├── renderer/
│   │   ├── public/                         # unbundled AudioWorklet and static assets
│   │   └── src/
│   │       ├── app/                        # library React application
│   │       │   ├── shell/                  # app header (identity, page tabs, meeting status, overlay toggle)
│   │       │   ├── controls/               # Switch, FieldRow, Badge, KeyBadge — the library's small control components
│   │       │   ├── pages/                  # route/page components
│   │       │   ├── jobs/                   # job presentation editor
│   │       │   ├── settings/
│   │       │   │   ├── sections/           # one component per Settings section (+ pure hotkey/update status)
│   │       │   │   └── frame/              # section list, index + scroll-spy, card, useSettingsDraft + patch/validation, save bar
│   │       │   └── styles/                 # tokens → base/controls → shell/transcript/pages/settings; overlay-* layers
│   │       ├── overlay-app/                # separate small overlay bundle
│   │       │   ├── shell/                  # session composition, layout, header, status, preferences
│   │       │   │   └── navigation/         # workspace reducer, local shortcuts, rail, compose handshake
│   │       │   ├── suggestions/            # answer surface, history coordination, manual requests
│   │       │   ├── workspaces/             # frame + secondary views (Screen, Slide, Transcript, Context); composer/ (Ask)
│   │       │   ├── controls/               # OverlayButton, OverlayTextArea, OpenSanasButton, overlay icons
│   │       │   ├── layout/                 # opacity, divider ratio/drag, resize grips
│   │       │   └── capture/                # capture action, status subscription and composer attachment state
│   │       ├── audio/                      # mic/loopback capture and worklet bridge
│   │       ├── lib/                        # pure shared renderer helpers (incl. overlay-workspaces.ts: workspace names + local shortcut table)
│   │       │   ├── meeting/                # meeting/context/presentation state and hooks
│   │       │   ├── presentation/           # slide editor and forgiving import
│   │       │   └── suggestions/            # safe suggestion rendering and history reducer
│   │       ├── dev/                        # typed browser-preview bridge mocks
│   │       └── env.d.ts                    # Vite client types
│   └── shared/                              # cross-process IPC and domain contracts
│       ├── presentation/                   # deck and timeline contracts
│       ├── live-controls/                  # context, admission, suggestion metadata and capture contracts
│       ├── hotkeys/                        # global shortcut actions and registration status
│       └── updates/                        # sanitized updater snapshots
├── scripts/                                # repository, release and owner-operation tooling
│   ├── release/                            # version, package, publish, install and smoke tooling
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

- `src/main/lifecycle/` — userData identity, capped/redacted main logging and normal startup wiring; normal startup is not loaded by smoke
- `src/main/diagnostics/` — isolated, headless packaged diagnostics used by `--smoke`
- `src/main/windows/` — BrowserWindow builders and the main → all-windows broadcast (`overlay-bounds.ts`: pure on-screen fitting of saved overlay bounds; `main-window.ts`: create or reveal — restore/show/focus, never reload)
- `src/main/ipc/` — typed IPC handlers; validate ingress and delegate, with no business logic (`windows.ts`: overlay toggle/resize/ghost, compose handshake and the parameterless Open Sanas)
- `src/main/` — process entry (`index.ts`, normal vs `--smoke` dispatch) and the display-media loopback handler (`system-audio.ts`)
- `src/main/services/` — main-process services and provider seams
- `src/main/services/stt/` — the swappable STT seam, Deepgram implementation and message normalization
- `src/main/services/turns/` — pure turn assembly and identity-role types; no I/O or timers
- `src/main/services/assistant/` — the swappable assistant seam and shared answer/classification logic
- `src/main/services/assistant/coach/` — next-point eligibility policy and coach prompt construction
- `src/main/services/assistant/presentation/` — presentation answer context, current-location hints and scoped coaching prompts
- `src/main/services/assistant/live-controls/` — typed, detail, audience and screen-capture request instructions
- `src/main/services/meetings/` — meeting lifecycle/STT/audio orchestration plus meeting-level facades
- `src/main/services/meetings/assist/` — per-meeting prompt/grounding state, manual and screen-capture admission, in-memory composer screen drafts (`capture-drafts.ts`), automatic coordination and suggestion execution
- `src/main/services/meetings/capture/` — AUDIO capture-side identity and capture-health policy (screen capture lives in `services/screen-capture/`)
- `src/main/services/meetings/context/` — pure preparation followed by commit/publication of live context changes
- `src/main/services/meetings/presentation/` — current cursor state and historical slide-marker formatting
- `src/main/services/meetings/status/` — live-meeting identity and post-processing guards
- `src/main/services/meetings/summary/` — meeting summaries, structured output handling and summary email
- `src/main/services/meetings/rediarize/` — batch re-diarization and speaker identity/name carry-over
- `src/main/services/meetings/merge/` — split-recording merge planning and application
- `src/main/services/meetings/recovery/` — startup repair of meetings left open by an earlier process
- `src/main/services/hotkeys/` — global shortcut registration/status, repeat suppression and callback containment
- `src/main/services/updates/` — electron-updater integration and restart eligibility checks
- `src/main/services/email/` — the email provider seam and SMTP implementation
- `src/main/services/retention/` — recording/meeting cleanup timers, preview and execution
- `src/main/services/history/` — FTS retrieval and grounded ask-your-history answers
- `src/main/services/audio-store/` — WAV recording for accepted capture audio
- `src/main/services/screen-capture/` — display selection, one-shot desktop capture, image sizing/encoding; no meeting or provider policy
- `src/main/db/` — database connection lifecycle, consistent pre-upgrade backup, migrations and SQLite helpers
- `src/main/db/repos/` — per-entity repositories (incl. the screen-answer storage codec `manual-kind.ts`); the only place SQL strings live
- `src/main/config/` — settings/secrets persistence and exhaustive settings validation
- `src/preload/` — typed contextBridge surface exposed to renderers
- `src/renderer/src/app/` — library UI root and entry point
- `src/renderer/src/app/shell/` — the library window frame: `AppHeader`, the `Page` union + `NAV` table (`pages.ts`) and the pure meeting-status wording
- `src/renderer/src/app/controls/` — small shared library controls (`Switch`, `FieldRow`, `Badge`, `KeyBadge`); styles live in `styles/controls.css`
- `src/renderer/src/app/pages/` — one component per library route/page; `SettingsPage` is layout and wiring only (its state is `useSettingsDraft`)
- `src/renderer/src/app/jobs/` — job-specific editors, currently the presentation deck editor
- `src/renderer/src/app/settings/sections/` — one component per Settings section, including independent update state, plus pure status wording (`hotkey-status.ts`, `update-status.ts`)
- `src/renderer/src/app/settings/frame/` — what every section shares: the section list (`settings-sections.ts`), card (`SettingsSection`), index + scroll-spy, the draft state (`useSettingsDraft`: load, externally changed keys, save state machine), the pure patch/dirty/validation logic and page-ownership lists (`settings-draft.ts`) and the save bar; `settings/SettingsSections.tsx` renders the cards in index order
- `src/renderer/src/app/styles/` — layered shared stylesheet; no per-page stylesheets. `tokens.css` is shared by both windows; the library imports `index.css` (base → controls → shell → transcript → pages → settings), the overlay imports `overlay-app/overlay.css` (tokens → controls → `overlay-controls` → `overlay-shell` → `overlay-panels` → `overlay-suggestions`)
- `src/renderer/src/overlay-app/` — deliberately small, separate overlay bundle
- `src/renderer/src/overlay-app/shell/` — `OverlaySession` (composes every controller once), `OverlayShell` layout, header, persistent status, preferences popover, window state, Answer every question
- `src/renderer/src/overlay-app/shell/navigation/` — pure workspace reducer, local shortcut table/dispatch, the rail, and the compose readiness/focus handshake
- `src/renderer/src/overlay-app/suggestions/` — the answer surface (full and preview), history/reading coordination and manual-request (detail/audience) policy
- `src/renderer/src/overlay-app/workspaces/` — the frame that keeps secondary views mounted plus one file per view (`OverlayCapturePanel`, `SlidePanel`, `OverlayTranscript`, `OverlayContext`); `composer/` (Ask: draft state, submission, view) is the only subfolder, kept because it has several files
- `src/renderer/src/overlay-app/controls/` — the overlay's small control wrappers (button variants, labelled textarea, Open Sanas) and local icons; not a general component framework
- `src/renderer/src/overlay-app/layout/` — overlay opacity and divider-ratio persistence, divider drag/measurement, and the three resize grips
- `src/renderer/src/overlay-app/capture/` — Capture screen action, capture status subscription/helpers and the composer's screen-attachment state (hooks only; the Screen view lives in `workspaces/`)
- `src/renderer/src/audio/` — renderer capture and AudioWorklet downsampling
- `src/renderer/src/lib/` — pure presentation helpers shared across renderer pages and bundles (`overlay-workspaces.ts`: workspace names and the local shortcut table shared by the overlay and Settings → Hotkeys)
- `src/renderer/src/lib/meeting/` — meeting, context and presentation reducers/hooks; `meeting-context-draft.ts` + `useMeetingContextDraft.ts` are the draft/apply/reload/conflict logic shared by the main window's full editor and the overlay's text-only Context
- `src/renderer/src/lib/presentation/` — reusable slide editing and import UI/helpers
- `src/renderer/src/lib/suggestions/` — text-safe compact/detail renderers and live history state
- `src/renderer/src/dev/` — browser-preview implementation of the typed preload bridge: `mock-api.ts` assembles it, `mock-fixtures.ts` holds the static sample data, `mock-live-meeting.ts` the scripted live meeting; `overlay-scenarios.ts` holds the deterministic overlay preview states (`overlay.html?scenario=<name>`) driven through `mockDriver`
- `src/renderer/public/` — AudioWorklet processors and other unbundled assets
- `src/shared/` — types shared by main, preload and renderer
- `src/shared/presentation/` — deck and historical timeline contracts
- `src/shared/hotkeys/` — global shortcut action and registration-status contracts
- `src/shared/live-controls/` — meeting-context, manual-admission, suggestion metadata and screen-capture contracts
- `src/shared/updates/` — renderer-safe update state and operation contracts
- `scripts/` — repository tooling plus release and owner-operation entry points
- `scripts/release/` — versioning, asset/package checks, publication, installation and packaged smoke
- `scripts/owner/` — redacted logs and owner-only release operation dispatch
- `.github/workflows/` — CI and manual release workflows
- `.github/actions/` — shared local workflow actions, including Node/download-cache setup

Tests are colocated `*.test.ts`/`*.test.tsx` files (Vitest, `npm test`) beside the modules they
cover. Coverage includes provider normalization, turn/assistant policy, presentation and live-control
state/admission/grounding, meeting lifecycle and post-processing, startup/backup/smoke/update wiring,
IPC validation, renderer reducers/renderers, shared timeline/format helpers, window behavior, and
release scripts. Repository SQL remains exercised through Electron-ABI diagnostics rather than
ordinary Vitest loading of `better-sqlite3`.

Deliberately _not_ homes: the repository root and `src/renderer/src/` itself. `src/main/` is a home
only for the process entry (`index.ts`) and the display-media handler (`system-audio.ts`); new
main-process code belongs in a responsibility folder above, not beside them.

## Responsibility boundaries (the seams that matter)

- **Startup modes stay isolated.** `main/index.ts` selects `--smoke` before importing normal startup;
  diagnostics use disposable userData and never initialize windows, IPC, providers, audio, retention,
  or updates.
- **Providers are interfaces.** `SttProvider`, `AssistantProvider` and `EmailProvider` isolate
  Deepgram, Claude and SMTP so any can be swapped without changing orchestration or UI.
- **`ipc/` stays thin.** Handlers validate and delegate to `services/`; renderers never access APIs,
  secrets or the database directly.
- **Meeting lifecycle and live controls are separate.** `meetings/index.ts` owns lifecycle, STT, audio
  and final persistence. `meetings/live-controls.ts` serializes context, manual request, answer-mode and
  slide actions against injected lifecycle state.
- **Assistance policy stays split.** `turns/turn-assembler` closes turns; assistant triggers,
  classifier and coach policy decide; `meetings/assist/manual-requests` admits explicit requests;
  `live-assistance` coordinates automatic work; `suggestion-runner` owns generation and persistence.
- **Prompt snapshots are synchronous and read-only.** `meetings/assist/meeting-prompts.ts` resolves and
  caches immutable grounding when context changes; request snapshots perform no database writes.
- **Presentation/context publication follows persistence.** Meeting context and slide cursor state are
  published only after their repository writes succeed; historical views use immutable deck versions
  and recorded events.
- **Repos own SQL.** No SQL strings live outside `db/repos/`; FTS5 expressions come only from
  `db/fts-query.ts`, and repository row types do not depend on service modules.
- **Updates expose sanitized state only.** Packaged normal startup owns updater network traffic and
  restart checks; renderer IPC is limited to typed snapshots and get/check/restart operations.
- **Overlay is a separate bundle.** It remains small and receives all privileged data through preload.
- **Settings and styles have fixed homes.** Settings sections are components under `app/settings/`;
  styles remain one layered vocabulary under `app/styles/`.

## Structural debt

- `renderer/src/lib/` is broad (loose helpers beside `meeting/`, `presentation/`, `suggestions/`) and
  `lib/meeting/` has a high file fan-out; split by responsibility before either grows again.
- The overlay's CSS layers (`overlay-controls/-shell/-panels/-suggestions.css`) live in
  `app/styles/` beside the library's, so the shared folder mixes two bundles; `.workspace-body` /
  `.workspace-actions` sit in `overlay-panels.css` while the workspace frame is in `overlay-shell.css`.
- `services/meetings/` and `services/assistant/` are both broad (many files plus subfolders);
  group by lifecycle vs. policy before adding more siblings.
- `shell/` and `workspaces/` are coupled through `OverlaySessionModel`: workspaces take the whole
  session, and `OverlaySession` imports the composer hook. Narrow the props per workspace if the
  session grows.
- `services/` now has 12 entries with `screen-capture/` (placed there by the screen-capture plan so
  it stays separate from audio capture); relieving that breadth is tracked by dk-bd2e1ebf.
- Screen answers are stored as `typed` plus a `[Screen capture]` request-text marker because the
  `suggestions` CHECK constraint has no `capture` kind. A real `capture` kind needs a table rebuild
  migration; the codec in `db/repos/manual-kind.ts` is the only place to change.

- `windows/main-window.ts` and `overlay-window.ts` share webPreferences/load-URL boilerplate. Extract a
  `createAppWindow(opts)` helper only if a third window appears.
- `AssistRequest.model`, `AssistRequest.effort` and `AssistRequest.workspaceId` map closely to
  Anthropic-specific knobs. A second provider will need its own model settings and interpretation.
- `services/meetings/assist/live-session.ts` imports `claudeProvider` concretely. This is deliberate
  while there is one assistant provider; the swap point remains one import line.
- SMTP credentials use the same plain local-settings trust model as API keys. `safeStorage` encryption
  for all secrets should be one future change if required.
- `EmailProvider.send(config, mail)` takes an SMTP-shaped configuration. A non-SMTP transport would
  change the seam and its caller; do not abstract it before a second transport exists.
