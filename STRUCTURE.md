# Sanas — Structure

*Code-shape map: components, responsibilities, dependencies, structural debt.*
*System design lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).*

Last full review: never (pre-code)

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
│   │   ├── services/
│   │   │   ├── stt/             # SttProvider seam + DeepgramSession (reconnect, diarization splits)
│   │   │   ├── assistant/       # AssistantProvider seam + claude.ts, prompts.ts, triggers.ts
│   │   │   ├── meetings/        # orchestration: STT session, persistence, assist loop, summaries
│   │   │   └── audio-store/     # opt-in WAV recording of the 16 kHz stream
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

(none yet — keep it that way)
