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
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # app lifecycle, hotkeys, userData pinning
│   │   ├── windows/             # main-window + overlay-window builders, broadcast (main → all windows)
│   │   ├── ipc/                 # typed IPC channel handlers (thin — delegate) + validate.ts (ingress checks)
│   │   ├── system-audio.ts      # display-media loopback handler (same-PC meeting audio)
│   │   ├── services/
│   │   │   ├── stt/             # SttProvider seam + DeepgramSession (reconnect, splits, batch)
│   │   │   │                    #   + deepgram-events (pure message normalization → finals + signals)
│   │   │   ├── turns/           # turn-assembler: finals + boundaries → completed turns (pure)
│   │   │   ├── assistant/       # AssistantProvider seam + claude.ts, prompts.ts, triggers (prefilter),
│   │   │   │                    #   classifier, coach-policy + coach-prompts, compact-contract, excerpt
│   │   │   ├── meetings/        # index (meeting/audio lifecycle, STT wiring, per-final persistence),
│   │   │   │                    #   export, remove (audio file + row — the one delete path)
│   │   │   │   ├── assist/      # live-session (window + shown headlines + prompt + runner/coordinator
│   │   │   │   │                #   assembly), live-assistance (coordinator), suggestion-runner,
│   │   │   │   │                #   suggestion-requests, suggestion-in-flight (lane policy)
│   │   │   │   ├── capture/     # channel-identity (ch0=user, one place), capture-health
│   │   │   │   ├── status/      # live-meeting (which meeting main is running), post-processing
│   │   │   │   │                #   (what is still being rewritten after stop)
│   │   │   │   ├── summary/     # summarize (post-stop + on-demand), summary-email (compose + send)
│   │   │   │   ├── rediarize/   # rediarize (batch pass after stop), speaker-carryover (pins + names)
│   │   │   │   ├── merge/       # merge + merge-plan (fold split recordings into one meeting)
│   │   │   │   └── recovery/    # startup-recovery (close rows stranded by an earlier process)
│   │   │   ├── email/           # EmailProvider seam + smtp.ts (nodemailer transport)
│   │   │   ├── retention/       # age-based clean-up of recordings / whole meetings (timer + on demand)
│   │   │   ├── history/         # ask-your-history: FTS5 retrieval + grounded, streamed answer
│   │   │   ├── transcript-format.ts # canonical main-side line formatting/windowing
│   │   │   └── audio-store/     # WAV recording of the capture stream (default on)
│   │   ├── db/                  # better-sqlite3 open + migrations, fts-query (text → safe FTS5 MATCH),
│   │   │                        #   sqlite-time (the one SQLite UTC datetime text format)
│   │   │   └── repos/           # jobs+glossary, meetings+segments, suggestions (SQL lives here only)
│   │   └── config/              # settings + API key storage, settings-schema (one check per key)
│   ├── preload/                 # contextBridge API surface (typed)
│   ├── renderer/                # vite root: index.html (library) + overlay.html
│   │   ├── public/              # AudioWorklet processor served as a static asset (not bundled)
│   │   └── src/
│   │       ├── app/             # library UI (React): App + entry, pages/, settings/ (one file per
│   │       │                    #   Settings section), styles/ (tokens → controls → shell → transcript → pages)
│   │       ├── overlay-app/     # overlay UI (React, separate tiny bundle)
│   │       ├── audio/           # (Phase 1) mic capture + AudioWorklet downsample
│   │       ├── lib/             # pure presentation helpers shared across pages (speaker label, hotkey
│   │       │   │                #   label, clock/date formatting, icons, IPC error text, glossary input)
│   │       │   ├── meeting/     # meeting-state reducer + useMeetingState, useTranscript
│   │       │   └── suggestions/ # CompactSuggestion (safe renderer), whisper-history + useSuggestionHistory
│   │       ├── dev/             # browser-preview mock of the preload bridge (dev only, never bundled)
│   │       └── env.d.ts         # Vite client types (import.meta.env)
│   └── shared/                  # IPC channel types, domain types (Job, Meeting, Segment…),
│                                #   suggestion-label (one label mapping: overlay/history/export)
├── scripts/                     # repo tooling (git-hook install, pre-commit)
├── .github/workflows/           # CI
├── docs/                        # living docs (this set)
├── vite.renderer.config.ts      # renderer-only Vite for the browser preview (npm run dev:web)
└── STRUCTURE.md
```

**Enforced homes:**

- `src/main/windows/` — BrowserWindow builders (library window, overlay window) and the
  main → all-windows broadcast
- `src/main/ipc/` — typed IPC channel handlers; validate (`validate.ts`: ids, free text, the
  job and settings payloads) + delegate, no business logic
- `src/main/services/` — main-process services and provider seams: `stt/`, `turns/`, `assistant/`,
  `email/`, `meetings/`, `audio-store/`, `retention/`, `history/`, plus main-side transcript
  formatting
- `src/main/services/turns/` — pure turn assembly (`turn-assembler.ts`, `types.ts`, which also owns
  `IdentityRole`); no I/O, no timers
- `src/main/services/meetings/` — the live meeting orchestrator (`index.ts`: lifecycle, STT wiring,
  per-final persistence), export and the one delete path (`remove.ts`)
- `src/main/services/meetings/assist/` — live assistance: the per-meeting assembly
  (`live-session.ts`: prompt window, shown headlines, system prompt, runner + coordinator
  wiring), coordinator, suggestion runner, request building, lane policy
- `src/main/services/meetings/capture/` — capture-side identity (`channel-identity.ts`) and
  capture health (`capture-health.ts`)
- `src/main/services/meetings/status/` — which meeting is live and which are still being
  rewritten after stop (the guards delete and merge consult)
- `src/main/services/meetings/summary/` — meeting summaries (post-stop, on demand) and the
  summary email
- `src/main/services/meetings/rediarize/` — the batch re-diarization pass and the pin/name
  carry-over it applies
- `src/main/services/meetings/merge/` — merging split recordings (pure plan + DB apply)
- `src/main/services/meetings/recovery/` — startup repair of meetings an earlier process left open
- `src/main/db/` — better-sqlite3 connection, schema migrations, the text → FTS5 MATCH
  builder (`fts-query.ts`, the only source of `FtsMatch`), and `sqlite-time.ts` (pure: the one
  builder/parser of SQLite's UTC datetime text, used by retention and startup recovery)
- `src/main/db/repos/` — per-entity repositories; the only place SQL strings live
- `src/main/config/` — settings persistence + API key storage, and the exhaustive per-key
  settings schema (`settings-schema.ts`) that IPC validation consumes
- `src/preload/` — contextBridge API surface exposed to the renderers, and its type declaration
- `src/renderer/src/app/` — library UI React app: root component and entry point
- `src/renderer/src/app/pages/` — one React component per library UI route/page
- `src/renderer/src/app/settings/` — sections of the Settings page, one component each
- `src/renderer/src/app/styles/` — the layered stylesheet (base → controls → shell → transcript →
  pages) and the shared control vocabulary; no per-page stylesheets
- `src/renderer/src/overlay-app/` — overlay UI React app (separate, deliberately tiny bundle)
- `src/renderer/src/audio/` — renderer-side mic capture + AudioWorklet downsampling
- `src/renderer/src/lib/` — pure presentation helpers shared across pages and both bundles
- `src/renderer/src/lib/meeting/` — the meeting-state reducer and the meeting/transcript hooks
- `src/renderer/src/lib/suggestions/` — the safe compact-suggestion parser/renderer used by both
  renderer bundles, and the live whisper-history reducer/follow policy + its hook
- `src/renderer/src/dev/` — the browser-preview mock of `window.sanas` (typed as
  `Window['sanas']`; installed by both renderer entry points only when the build-time
  `__SANAS_WEB_PREVIEW__` is true — set by `vite.renderer.config.ts`, false in the Electron build).
  `src/renderer/src/env.d.ts` is the one file beside these folders: Vite client types.
- `src/renderer/public/` — AudioWorklet processors and other assets served unbundled
- `src/shared/` — types shared by main, preload and renderer (IPC channels, domain models),
  suggestion labels, and the constrained knowledge-summary Markdown parser used by the meeting
  view and summary email
- `scripts/` — repo tooling scripts (git-hook installation, pre-commit)

Tests are colocated `*.test.ts` files (vitest, `npm test`) beside the module they cover:
`services/turns/turn-assembler`, `services/stt/deepgram-events` and `deepgram`;
`services/assistant/` triggers, classifier, coach-policy, coach-prompts, prompts, claude and
completion-result; `services/meetings/assist/` live-assistance, suggestion-runner and
suggestion-in-flight; `services/meetings/capture/` capture-health and channel-identity;
`services/meetings/` `rediarize/speaker-carryover`, `merge/merge-plan`, `status/post-processing`
and `recovery/startup-recovery`; `meetings/summary/summary-output`;
`services/assistant/compact-contract`; `config/settings`,
`db/fts-query`, `db/sqlite-time`, `ipc/validate`, `shared/search-markers`,
`shared/suggestion-label`, `shared/summary-markdown`, and the renderer helpers (`lib/glossary-input`,
`lib/meeting/meeting-state`, `lib/suggestions/` CompactSuggestion + whisper-history,
`overlay-app/` overlay-split).
Services that read settings are tested by mocking electron/fs (`config/settings.test.ts`).
DB-bound code (repos, migrations) has none — better-sqlite3 is built for Electron's ABI, so
vitest cannot load it.

Deliberately _not_ homes: the repo root (config + docs only), `src/main/` itself and
`src/renderer/src/` itself. New main-process code belongs in a responsibility folder above,
not beside `index.ts` / `system-audio.ts`.

## Responsibility boundaries (the seams that matter)

- **Providers are interfaces** — `SttProvider`, `AssistantProvider` and `EmailProvider`
  isolate Deepgram, Claude and SMTP so any can be swapped without touching orchestration or UI.
- **`ipc/` stays thin** — handlers validate + delegate to `services/`; no business logic
  in IPC glue. Renderer never talks to APIs or the DB directly.
- **Turn detection, classification and coaching are their own modules.** `stt/deepgram-events`
  normalizes provider messages, `turns/turn-assembler` closes turns, and `assistant/triggers`
  (prefilter), `classifier` and `coach-policy` decide — all pure or behind the provider seam.
  `meetings/assist/live-assistance` is only the coordinator (turn assembly, timers, admission,
  freshness, cancellation; no SQL or SDK imports); `suggestion-runner` owns generation and
  persistence. Keep all of it out of the Claude client.
- **Repos own SQL** — no SQL strings outside `db/repos/`. FTS5 MATCH expressions are built
  only by `db/fts-query.ts` from user text (every token quoted), never concatenated elsewhere.
- **Overlay is a separate bundle** from the main renderer — it must stay tiny and fast.
- **Settings sections are components** — `app/settings/` holds one file per section;
  `SettingsPage` owns the draft and the save, nothing else.
- **Styles are layered, not per page** — `app/styles/` is tokens → base → controls → shell →
  transcript → pages. Page markup uses the shared vocabulary (`.btn`, `.field`, `.card`,
  `.chip`, `.line`); a page-specific rule goes in `pages.css`, never a per-page stylesheet.
  State modifiers are bare classes (`live`, `active`, `me`); page roots are `*-page`.

## Structural debt

- `windows/main-window.ts` + `overlay-window.ts` share webPreferences/load-URL
  boilerplate — extract a `createAppWindow(opts)` helper if a third window appears
  (deliberately not abstracted at two call sites).
- `AssistRequest.model`, `AssistRequest.effort` and `AssistRequest.workspaceId` on the
  provider seam map closely to Anthropic-specific knobs (Claude model IDs, output effort,
  and the `anthropic-workspace-id` header). A second provider would need its own model-ID
  settings and interpretation of low/medium/high, and likely no workspace concept at all.
- `services/meetings/index.ts` reaches STT through the `stt/index.ts` seam but still imports
  `claudeProvider` concretely (no DI/composition root) — deliberate while there is exactly one
  of each; the swap point is one import line (`services/email/index.ts` and
  `services/history/index.ts` follow the same pattern).
  Revisit only when a second provider actually exists.
- SMTP password sits in plain `settings.json` next to the API keys — same trust model,
  same debt; `safeStorage` encryption for all three is one change if it ever matters.
- `EmailProvider.send(config, mail)` takes an SMTP-shaped `SmtpConfig` (host/port/user/pass),
  so a REST transport (Resend/SendGrid — rejected in DECISIONS.md) would change the seam's
  signature and its one caller, not just add an implementation. Deliberate while SMTP is the
  chosen design. A second builder of that config (none planned) is the point to extract
  `smtpConfigFromSettings()`, not before.

(2026-08-27 review: transcript formatting/windowing extracted to
`services/transcript-format.ts`; summary prompt moved into `assistant/prompts.ts`.
2026-09-08: summary split out of the orchestrator into `meetings/summarize.ts` when the
on-demand path was added. 2026-10-29: live-assist state + wiring extracted from
`meetings/index.ts` into `meetings/assist/live-session.ts`; `meetings/` and renderer `lib/`
grouped into responsibility subfolders; `IdentityRole` moved into `turns/types.ts`;
SQLite datetime text centralised in `db/sqlite-time.ts`.)

## Presentation mode (2026-10-30)

- `shared/presentation/`: deck contracts and limits, historical timeline ordering, shortcut status types.
- `db/repos/job-slides.ts`, `meeting-presentation.ts`, `presentation-schema.ts`: atomic deck replacement, immutable snapshots/events, v6 DDL. Existing v1?v5 SQL remains in migrations.ts; new SQL stays in repos.
- `assistant/coach/`: moved coach policy/prompts and tests; `assistant/presentation/`: deck context, current-location hint, restricted coach prompt.
- `meetings/presentation/`: cursor with persistence-before-publication and recorded transcript formatting; `assist/presentation-evidence.ts`: independent visit evidence.
- `services/hotkeys/`: registration/status, callback errors and repeat suppression.
- Renderer `app/jobs/`: presentation editor and forgiving paste preview; `overlay-app/SlidePanel.tsx`: teleprompter; `lib/meeting/`: presentation hydration/revision checks.

Presentation tests are colocated with these modules. The browser mock is isolated in `dev/mock-presentation.ts`.
