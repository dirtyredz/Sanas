# Sanas — Structure

*Code-shape map: components, responsibilities, dependencies, structural debt.*
*System design lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).*

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
│   │   │   │                    #   channel-identity (ch0=user semantics, one place)
│   │   │   ├── transcript-format.ts # canonical main-side line formatting/windowing
│   │   │   └── audio-store/     # WAV recording of the capture stream (default on)
│   │   ├── db/                  # better-sqlite3 open + migrations
│   │   │   └── repos/           # jobs+glossary, meetings+segments, suggestions (SQL lives here only)
│   │   └── config/              # settings + API key storage
│   ├── preload/                 # contextBridge API surface (typed)
│   ├── renderer/                # vite root: index.html (library) + overlay.html
│   │   └── src/
│   │       ├── app/             # library UI (React): App, pages/, styles
│   │       ├── overlay-app/     # overlay UI (React, separate tiny bundle)
│   │       └── audio/           # (Phase 1) mic capture + AudioWorklet downsample
│   └── shared/                  # IPC channel types, domain types (Job, Meeting, Segment…)
├── docs/                        # living docs (this set)
└── STRUCTURE.md
```

## Responsibility boundaries (the seams that matter)

- **Providers are interfaces** — `SttProvider` and `AssistantProvider` isolate Deepgram
  and Claude so either can be swapped without touching orchestration or UI.
- **`ipc/` stays thin** — handlers validate + delegate to `services/`; no business logic
  in IPC glue. Renderer never talks to APIs or the DB directly.
- **Trigger engine is its own module** inside `assistant/` — ambient-detection heuristics
  will grow and churn; keep them out of the Claude client.
- **Repos own SQL** — no SQL strings outside `db/repos/`.
- **Overlay is a separate bundle** from the main renderer — it must stay tiny and fast.

## Structural debt

- `windows/main-window.ts` + `overlay-window.ts` share webPreferences/load-URL
  boilerplate — extract a `createAppWindow(opts)` helper if a third window appears
  (deliberately not abstracted at two call sites).
- `AssistRequest.effort` on the provider seam maps 1:1 to an Anthropic-specific knob;
  a second provider would need its own interpretation of low/medium/high.
- `summarizeMeeting` lives in `services/meetings/index.ts` rather than its own module —
  kept there because it shares the orchestrator's meeting state; split it out if it grows.
- `services/meetings/index.ts` imports `deepgramProvider`/`claudeProvider` concretely
  (no DI/composition root) — deliberate while there is exactly one of each; the swap
  point is one import line. Revisit only when a second provider actually exists.

(2026-08-27 review: transcript formatting/windowing extracted to
`services/transcript-format.ts`; summary prompt moved into `assistant/prompts.ts`.)
