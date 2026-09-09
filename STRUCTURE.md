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
│   │   ├── windows/             # main-window + overlay-window builders
│   │   ├── ipc/                 # typed IPC channel handlers (thin — delegate to services)
│   │   ├── system-audio.ts      # display-media loopback handler (same-PC meeting audio)
│   │   ├── services/
│   │   │   ├── stt/             # SttProvider seam + DeepgramSession (reconnect, splits, batch)
│   │   │   ├── assistant/       # AssistantProvider seam + claude.ts, prompts.ts, triggers.ts
│   │   │   ├── meetings/        # index (live orchestration) + rediarize, export,
│   │   │   │                    #   summarize (post-stop + on-demand), summary-email
│   │   │   │                    #   (compose + send), channel-identity (ch0=user, one place),
│   │   │   │                    #   speaker-carryover (pins + names across re-diarization),
│   │   │   │                    #   remove (audio file + row — the one delete path)
│   │   │   ├── email/           # EmailProvider seam + smtp.ts (nodemailer transport)
│   │   │   ├── retention/       # age-based clean-up of recordings / whole meetings (timer + on demand)
│   │   │   ├── transcript-format.ts # canonical main-side line formatting/windowing
│   │   │   └── audio-store/     # WAV recording of the capture stream (default on)
│   │   ├── db/                  # better-sqlite3 open + migrations
│   │   │   └── repos/           # jobs+glossary, meetings+segments, suggestions (SQL lives here only)
│   │   └── config/              # settings + API key storage
│   ├── preload/                 # contextBridge API surface (typed)
│   ├── renderer/                # vite root: index.html (library) + overlay.html
│   │   ├── public/              # AudioWorklet processor served as a static asset (not bundled)
│   │   └── src/
│   │       ├── app/             # library UI (React): App + entry, pages/, settings/ (one file per
│   │       │                    #   Settings section), styles/ (tokens → controls → shell → transcript → pages)
│   │       ├── overlay-app/     # overlay UI (React, separate tiny bundle)
│   │       ├── audio/           # (Phase 1) mic capture + AudioWorklet downsample
│   │       ├── lib/             # renderer-side hooks + pure helpers shared across pages (speaker label,
│   │       │                    #   hotkey label, clock/date formatting, icons, meeting-state + transcript hooks)
│   │       ├── dev/             # browser-preview mock of the preload bridge (dev only, never bundled)
│   │       └── env.d.ts         # Vite client types (import.meta.env)
│   └── shared/                  # IPC channel types, domain types (Job, Meeting, Segment…)
├── scripts/                     # repo tooling (git-hook install, pre-commit)
├── .github/workflows/           # CI
├── docs/                        # living docs (this set)
├── vite.renderer.config.ts      # renderer-only Vite for the browser preview (npm run dev:web)
└── STRUCTURE.md
```

**Enforced homes:**

- `src/main/windows/` — BrowserWindow builders (library window, overlay window)
- `src/main/ipc/` — typed IPC channel handlers; validate + delegate, no business logic
- `src/main/services/` — main-process services and provider seams: `stt/`, `assistant/`,
  `email/`, `meetings/`, `audio-store/`, `retention/`, plus main-side transcript formatting
- `src/main/db/` — better-sqlite3 connection + schema migrations
- `src/main/db/repos/` — per-entity repositories; the only place SQL strings live
- `src/main/config/` — settings persistence + API key storage
- `src/preload/` — contextBridge API surface exposed to the renderers, and its type declaration
- `src/renderer/src/app/` — library UI React app: root component and entry point
- `src/renderer/src/app/pages/` — one React component per library UI route/page
- `src/renderer/src/app/settings/` — sections of the Settings page, one component each
- `src/renderer/src/app/styles/` — the layered stylesheet (base → controls → shell → transcript →
  pages) and the shared control vocabulary; no per-page stylesheets
- `src/renderer/src/overlay-app/` — overlay UI React app (separate, deliberately tiny bundle)
- `src/renderer/src/audio/` — renderer-side mic capture + AudioWorklet downsampling
- `src/renderer/src/lib/` — renderer hooks and pure helpers shared across pages
- `src/renderer/src/dev/` — the browser-preview mock of `window.sanas` (typed as
  `Window['sanas']`; installed by both renderer entry points only when the build-time
  `__SANAS_WEB_PREVIEW__` is true — set by `vite.renderer.config.ts`, false in the Electron build).
  `src/renderer/src/env.d.ts` is the one file beside these folders: Vite client types.
- `src/renderer/public/` — AudioWorklet processors and other assets served unbundled
- `src/shared/` — types shared by main, preload and renderer (IPC channels, domain models)
- `scripts/` — repo tooling scripts (git-hook installation, pre-commit)

Tests are colocated `*.test.ts` files (vitest, `npm test`) beside the pure module they cover —
today `services/meetings/speaker-carryover.test.ts`; DB/Electron-bound code has none yet.

Deliberately _not_ homes: the repo root (config + docs only), `src/main/` itself and
`src/renderer/src/` itself. New main-process code belongs in a responsibility folder above,
not beside `index.ts` / `system-audio.ts`.

## Responsibility boundaries (the seams that matter)

- **Providers are interfaces** — `SttProvider`, `AssistantProvider` and `EmailProvider`
  isolate Deepgram, Claude and SMTP so any can be swapped without touching orchestration or UI.
- **`ipc/` stays thin** — handlers validate + delegate to `services/`; no business logic
  in IPC glue. Renderer never talks to APIs or the DB directly.
- **Trigger engine is its own module** inside `assistant/` — ambient-detection heuristics
  will grow and churn; keep them out of the Claude client.
- **Repos own SQL** — no SQL strings outside `db/repos/`.
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
- `AssistRequest.effort` and `AssistRequest.workspaceId` on the provider seam map 1:1 to
  Anthropic-specific knobs (output effort; the `anthropic-workspace-id` header). A second
  provider would need its own interpretation of low/medium/high and likely no workspace
  concept at all.
- `services/meetings/index.ts` imports `deepgramProvider`/`claudeProvider` concretely
  (no DI/composition root) — deliberate while there is exactly one of each; the swap
  point is one import line (`services/email/index.ts` follows the same pattern).
  Revisit only when a second provider actually exists.
- SMTP password sits in plain `settings.json` next to the API keys — same trust model,
  same debt; `safeStorage` encryption for all three is one change if it ever matters.
- `EmailProvider.send(config, mail)` takes an SMTP-shaped `SmtpConfig` (host/port/user/pass),
  so a REST transport (Resend/SendGrid — rejected in DECISIONS.md) would change the seam's
  signature and its one caller, not just add an implementation. Deliberate while SMTP is the
  chosen design. A second builder of that config (none planned) is the point to extract
  `smtpConfigFromSettings()`, not before.
- `ipc/` runtime-validates row ids at ingress (`requireId`, 2026-09-09) but still trusts
  preload's TypeScript types for string/object payloads (job update, glossary add, rename,
  settings patch, search). Shape-checking those is docs/BACKLOG.md P2.

(2026-08-27 review: transcript formatting/windowing extracted to
`services/transcript-format.ts`; summary prompt moved into `assistant/prompts.ts`.
2026-09-08: summary split out of the orchestrator into `meetings/summarize.ts` when the
on-demand path was added.)
