# Sanas — Backlog

*Prioritized task trough. P0 = next up, P1 = soon, P2 = someday.*

## ✅ Phase 0: Scaffold (done 2026-08-27)
- [x] Electron + Vite + TS + React scaffold (electron-vite)
- [x] Two windows: main (library) + overlay (frameless, always-on-top, hidden by default)
- [x] Global hotkey: toggle overlay (default Ctrl+Shift+Space)
- [x] IPC skeleton (typed channels, contextIsolation on)
- [x] SQLite via better-sqlite3 + migration runner + v1 schema
- [x] Settings screen: Deepgram key, Anthropic key, input device picker

## ✅ Phase 1: Hear & transcribe (done 2026-08-27; transcription verified live)
- [x] Mic capture + AudioWorklet downsample to 16 kHz mono linear16 (static worklet file — CSP)
- [x] Audio chunk IPC stream renderer → main
- [x] Deepgram WS client (main): connect, stream, keepalive, keyterms, per-speaker-run splitting
- [x] Transcript event fan-out: interims → UI, finals → SQLite `segments`
- [x] Live transcript in main window + overlay tail
- [x] "That's me" speaker pinning
- [ ] Deepgram auto-reconnect with transcript continuity (deferred — P1)
- [ ] Validate diarization quality in a real meeting (short-fragment tests are worst-case)

## ✅ Phase 2: Jobs & context (done 2026-08-27)
- [x] Jobs CRUD + context pack editor (company info, scope, notes, talking points, persona)
- [x] Glossary editor; terms → Deepgram keyterms on meeting start
- [x] Meeting lifecycle: start (job picker, remembers last) / stop; meeting list; transcript view

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
