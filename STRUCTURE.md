# Sanas — Structure

*Code-shape map: components, responsibilities, dependencies, structural debt.*
*System design lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).*

Last full review: never (pre-code)

## Status
Pre-code. The layout below is the **intended** shape — keep it honest as code lands.

## Intended layout

```
sanas/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # app lifecycle, window creation
│   │   ├── windows/             # main-window + overlay-window builders
│   │   ├── ipc/                 # typed IPC channel handlers (thin — delegate to services)
│   │   ├── services/
│   │   │   ├── stt/             # SttProvider interface + DeepgramProvider
│   │   │   ├── assistant/       # AssistantProvider interface + ClaudeProvider,
│   │   │   │                    #   prompt assembly, trigger engine
│   │   │   ├── meetings/        # meeting lifecycle orchestration
│   │   │   └── audio-store/     # optional raw-audio file writing
│   │   ├── db/                  # better-sqlite3 open, migrations, repositories
│   │   │   └── repos/           # jobs, glossary, meetings, segments, suggestions
│   │   └── config/              # settings + API key storage
│   ├── preload/                 # contextBridge API surface (typed)
│   ├── renderer/                # main window UI (React)
│   │   ├── pages/               # Jobs, JobDetail, Meeting, LiveMeeting, Settings
│   │   ├── components/
│   │   └── audio/               # mic capture + AudioWorklet (downsample)
│   ├── overlay/                 # overlay window UI (React, minimal & separate bundle)
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
