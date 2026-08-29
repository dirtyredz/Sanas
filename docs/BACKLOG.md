# Sanas — Backlog

_Prioritized task trough. P0 = next up, P1 = soon, P2 = someday._

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

## ✅ Phase 3: AI assist (done 2026-08-27; untested pending Anthropic key)

- [x] Claude streaming client (main, claude-opus-5) + prompt assembly (cached system = context pack)
- [x] Hotkey (Ctrl+Shift+Enter) → full answer streamed into overlay + "Answer now" button
- [x] Ambient trigger engine: question detection on non-user finals, 20s debounce
- [x] Suggestion persistence
- [x] Per-meeting suggestion log view (tab in MeetingView)

## Phase 4: Wrap-up (in progress 2026-08-27)

- [x] Post-meeting summary + action items (generated on stop, shown in MeetingView)
- [x] Overlay position/size memory
- [x] Deepgram auto-reconnect with backoff + timestamp continuity
- [x] electron-builder packaging (Windows NSIS)
- [x] Opt-in audio recording to disk (WAV, Settings checkbox)
- [x] Overlay ghost mode (👻 → clicks pass through; overlay hotkey restores)
- [x] Overlay opacity slider (Settings, live-applied)
- [x] Meeting rename (inline title edit in MeetingView)
- [ ] Retention/auto-purge controls (per-meeting delete exists)

## P2 — Post-v1 ideas

- [x] Meeting search across jobs (Search page, snippet highlight)
- [x] Markdown export (meeting → .md via save dialog)
- [ ] Ask-your-history chat (RAG over segments)
