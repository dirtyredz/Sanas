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
- [x] Deepgram auto-reconnect with transcript continuity (landed in Phase 4)
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
- [x] Audio recording to disk (WAV; on by default, Settings checkbox)
- [x] Overlay ghost mode (👻 → clicks pass through; overlay hotkey restores)
- [x] Overlay opacity slider (Settings, live-applied)
- [x] Meeting rename (inline title edit in MeetingView)
- [x] On-demand Summarize/Regenerate from stored transcript (2026-09-08)
- [x] Email summary to the job's address via SMTP; optional auto-send on stop (2026-09-08)
- [x] Summary + assist prompts use speaker names instead of S1/S2 labels (2026-09-09)
- [x] Meeting source per meeting (This PC / Elsewhere) — fixes "everyone showed up as Me"
      when the call was on another laptop; pins + names now survive re-diarization (2026-09-09)
- [x] Retention/auto-purge controls — separate limits for recordings and whole meetings, timer
      in main + "Clean up now" with preview in Settings; deleting a meeting now removes its WAV (2026-09-09)

## P2 — Post-v1 ideas

- [x] Merge meetings into one — job page selection, wall-clock offsets, speaker blocks (2026-09-09)
- [ ] Buffer PCM through the provider's reconnect backoff and replay it, so a brief network
      blip does not leave an untranscribed gap (today those chunks reach the WAV only)
- [ ] Global hotkey for pause/resume, so an interruption can be handled without the window
- [ ] Main-process log to a file: `electron-vite dev` does not forward the Electron child's
      stdout, so `console.log` from main is invisible outside DevTools

### Callback containment — the rest of the sweep (Codex, 2026-09-09)

The pause/merge review wrapped every write that runs from a provider callback or a timer in
`services/meetings`, `services/audio-store`, `services/retention` and `windows/overlay-window`.
These are the same class, judged not-yet-reachable and left for a deliberate pass — the rule is
in docs/GOTCHAS.md: **nothing that runs without a catch above it may throw.**

- [ ] `stt/deepgram.ts` keepalive timer and `ipc/index.ts` audio ingress both assume
      `WebSocket.send()` cannot throw synchronously; a transport that does would escape the
      timer and the IPC listener
- [ ] `services/history/index.ts` no-results timer and `windows/broadcast.ts` send to
      `webContents` without containment — a send during renderer teardown could escape
- [ ] `main/index.ts` startup has no terminal `.catch`: an `openDb()` failure becomes an
      unhandled rejection at launch rather than a message the user can act on
- [ ] Settings' retention preview refresh after a failed clean-up is outside the try, so a
      second failure is an unhandled rejection in the renderer

### Live-meeting polish

- [ ] The on-screen clock keeps counting until main confirms a pause, so it can include the
      WebSocket shutdown handshake after capture already stopped. Stored timestamps and the
      WAV are unaffected — this is display only.

- [ ] Light theme — only if a daytime user appears (the token set makes it a second `:root` block)
- [ ] Visual QA in the real Electron window — the browser preview cannot show the frameless
      overlay at 380×460, transparency, or the Windows title bar

- [x] `ipc/`: every renderer argument is checked at ingress — ids, free text, and the job and
      settings payloads (`ipc/validate.ts`, 2026-09-09)
- [ ] Neutralize the `EmailProvider` seam (SMTP-shaped `SmtpConfig`) — only if a second
      transport ever arrives (see STRUCTURE.md structural debt)
- [x] Meeting search across jobs (Search page, snippet highlight)
- [x] Markdown export (meeting → .md via save dialog)
- [x] Ask-your-history (FTS5 retrieval + grounded Claude answer with citations, 2026-09-09)
