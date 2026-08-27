# Sanas — Backlog

*Prioritized task trough. P0 = next up, P1 = soon, P2 = someday.*

## ✅ Phase 0: Scaffold (done 2026-08-27)
- [x] Electron + Vite + TS + React scaffold (electron-vite)
- [x] Two windows: main (library) + overlay (frameless, always-on-top, hidden by default)
- [x] Global hotkey: toggle overlay (default Ctrl+Shift+Space)
- [x] IPC skeleton (typed channels, contextIsolation on)
- [x] SQLite via better-sqlite3 + migration runner + v1 schema
- [x] Settings screen: Deepgram key, Anthropic key, input device picker

## P0 — Phase 1: Hear & transcribe
- [ ] Mic capture + AudioWorklet downsample to 16 kHz mono linear16
- [ ] Audio chunk IPC stream renderer → main
- [ ] Deepgram WS client (main): connect, stream, reconnect, keyterms param
- [ ] Transcript event fan-out: interims → UI, finals → SQLite `segments`
- [ ] Live transcript component (main window first, overlay later)
- [ ] "That's me" speaker pinning

## P1 — Phase 2: Jobs & context
- [ ] Jobs CRUD + context pack editor
- [ ] Glossary editor; wire terms → Deepgram keyterms on meeting start
- [ ] Meeting lifecycle: start (pick job) / stop; meeting list; transcript view

## P1 — Phase 3: AI assist
- [ ] Claude streaming client (main) + prompt assembly (context pack + transcript window)
- [ ] Hotkey → full answer in overlay
- [ ] Ambient trigger engine: question detection on non-user finals, debounce floor
- [ ] Suggestion persistence + per-meeting log view

## P2 — Phase 4: Wrap-up
- [ ] Post-meeting summary + action items
- [ ] Opt-in audio recording to disk
- [ ] Overlay polish: opacity, position memory, click-through
- [ ] Retention/delete controls
- [ ] electron-builder packaging (Windows)

## P2 — Post-v1 ideas
- [ ] Meeting search across jobs
- [ ] Markdown export
- [ ] Ask-your-history chat (RAG over segments)
