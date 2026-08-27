# Sanas — how to work here

Live meeting copilot (Electron, Windows). Whisper-quiet AI suggestions during real
meetings, organized per job. Read [STRUCTURE.md](STRUCTURE.md) and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before touching code;
[docs/GOTCHAS.md](docs/GOTCHAS.md) before touching audio, IPC, or the APIs.

## Ground rules

- **This is NOT an interview-cheating tool.** Framing, copy, and features target the
  user's real multi-job/client work. Don't drift the product toward interview use.
- **Privacy boundary:** API keys and all external traffic live in the **main process
  only**. Renderer gets data via typed IPC. `contextIsolation` stays on.
- **Providers stay swappable:** all STT work goes through `SttProvider`, all LLM work
  through `AssistantProvider`. Never import the Deepgram/Anthropic SDK outside those.
- **Only persist STT finals** — interims are ephemeral UI state.
- **No SQL outside `db/repos/`.**
- Local-only storage (SQLite + files). No cloud persistence without an explicit decision
  recorded in docs/DECISIONS.md.

## Stack

electron-vite · TypeScript · React · better-sqlite3 (native — needs electron-rebuild) ·
Deepgram streaming WS · Anthropic API (streaming).

## Docs are living

When a change makes a decision → DECISIONS.md; adds/changes a feature → FEATURES.md;
reveals a trap → GOTCHAS.md; alters components → STRUCTURE.md; defers work → BACKLOG.md.
