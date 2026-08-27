# Sanas — Roadmap

*Phased build order. Each phase ends with something you can actually run.*

## Phase 0 — Scaffold ✅→📋
Electron + Vite + TypeScript + React scaffold; two windows (main, overlay); IPC skeleton;
SQLite opened + migrations; settings page storing API keys locally.
**Done when:** app launches, overlay toggles with hotkey, DB file created.

## Phase 1 — Hear & transcribe (the vertical slice)
Mic capture → AudioWorklet → IPC → Deepgram WS → live diarized transcript rendered in
the main window; finals persisted to `segments`.
**Done when:** you talk near the laptop during a real call and watch an accurate live
transcript with speaker labels appear and persist.

## Phase 2 — Jobs & context packs
Jobs CRUD; context pack editor (company info, project scope, notes, talking points,
persona); glossary editor; glossary wired into Deepgram keyterms; meetings created under
a job; meeting list + transcript playback view.
**Done when:** you start a meeting *under a job* and jargon from its glossary transcribes correctly.

## Phase 3 — The whisper (AI assist)
Claude client (streaming) in main; prompt assembly from context pack + transcript window;
hotkey → full answer streamed into overlay; suggestion log persisted.
Then ambient triggers: question detection on non-user finals + debounce → short nudges.
**Done when:** in a live meeting, someone asks you something and Sanas quietly tells you
what to say — grounded in that job's context.

## Phase 4 — Wrap-up & polish
Post-meeting summary + action items; opt-in audio recording; overlay UX polish
(opacity, position memory, click-through mode); retention setting; packaging
(electron-builder, Windows installer).
**Done when:** daily-drivable across all your jobs.

## Post-v1 (deferred)
Meeting search · exports · ask-your-history chat (RAG) · cloud sync if a second device
ever appears · alternative STT/LLM providers behind the existing interfaces.
