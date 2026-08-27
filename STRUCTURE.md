# Sanas — Structure

*Code-shape map: components, responsibilities, dependencies, structural debt.*
*System design lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).*

Last full review: never (pre-code)

## Status
Phase 0 (scaffold) built. Layout reflects what exists; `services/` and `repos/` land in Phases 1–3.

## Layout

```
sanas/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # app lifecycle, hotkeys, userData pinning
│   │   ├── windows/             # main-window + overlay-window builders
│   │   ├── ipc/                 # typed IPC channel handlers (thin — delegate to services)
│   │   ├── services/            # (Phase 1+)
│   │   │   ├── stt/             # SttProvider interface + DeepgramProvider
│   │   │   ├── assistant/       # AssistantProvider interface + ClaudeProvider,
│   │   │   │                    #   prompt assembly, trigger engine
│   │   │   ├── meetings/        # meeting lifecycle orchestration
│   │   │   └── audio-store/     # optional raw-audio file writing
│   │   ├── db/                  # better-sqlite3 open, migrations, repositories
│   │   │   └── repos/           # (Phase 2) jobs, glossary, meetings, segments, suggestions
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

(none yet — keep it that way)
