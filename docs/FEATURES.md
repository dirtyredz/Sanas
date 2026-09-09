# Sanas — Features

_Capability inventory. Status: ✅ done · 🔨 in progress · 📋 planned · 💤 deferred_

## Core loop

| Feature                                          | Status | Notes                                                                          |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------ |
| Mic capture → 16 kHz PCM stream                  | ✅     | AudioWorklet (static file; AGC/EC/NS off)                                      |
| Deepgram streaming transcription                 | ✅     | nova-3, diarize, interims, keepalive                                           |
| Glossary → STT keyterm boosting                  | ✅     | per selected job                                                               |
| Live transcript view (overlay + main)            | ✅     | interims live, finals persisted                                                |
| "That's me" speaker pinning                      | ✅     | per meeting (Elsewhere mode); re-labels past segments; survives re-diarization |
| Ambient AI nudges (question/moment detection)    | ✅     | non-user questions, 20s debounce, effort=low                                   |
| On-demand full answer (global hotkey)            | ✅     | Ctrl+Shift+Enter or "Answer now" button                                        |
| Always-on-top overlay window                     | ✅     | frameless, screen-saver level, hotkey toggle, position memory                  |
| Deepgram auto-reconnect                          | ✅     | backoff, monotonic timestamps across reconnects                                |
| System-audio loopback capture                    | ✅     | same-PC meetings; ch0=me ch1=them via multichannel                             |
| Post-meeting batch re-diarization                | ✅     | stable speaker labels; needs recordAudio (default on)                          |
| Speaker rename + merge                           | ✅     | per meeting, in transcript view; export uses names                             |
| Meeting source per meeting (This PC / Elsewhere) | ✅     | Live page, remembered; Elsewhere = mono + "that's me" pinning                  |
| Pins + names carried across re-diarization       | ✅     | time-overlap remap (speaker-carryover)                                         |
| Speaker names in summaries + assist prompts      | ✅     | user-assigned names replace S1/S2 wherever the transcript is rendered          |

## Organization

| Feature                                                                            | Status | Notes                                                                       |
| ---------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| Jobs (create/edit/archive)                                                         | ✅     | archive UI pending, repo supports it                                        |
| Job context pack: company info, project scope, notes, talking points, persona/tone | ✅     | feeds AI in Phase 3                                                         |
| Per-job glossary (terms + notes)                                                   | ✅     | feeds STT now, AI in Phase 3                                                |
| Meetings under a job; transcript view                                              | ✅     | job picker on Live, history per job, rename, move to another job            |
| Post-meeting summary + action items                                                | ✅     | fire-and-forget on stop; shown in meeting view                              |
| On-demand summary (Summarize / Regenerate)                                         | ✅     | stored transcript (capped ~30k chars) + job context; button in meeting view |
| Email summary to the job's address                                                 | ✅     | recipient per job; SMTP (nodemailer); button + auto-send on stop            |

## App

| Feature                                                         | Status | Notes                                                                  |
| --------------------------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| Settings: API keys, hotkey, audio device, SMTP                  | ✅     | secrets main-process only, masked view to renderer                     |
| SQLite storage + v1 schema + migrations                         | ✅     | %APPDATA%/sanas/sanas.db, WAL                                          |
| Retention controls                                              | ✅     | audio after N days / whole meetings after N days; timer + Clean up now |
| Overlay ghost mode (click-through)                              | ✅     | 👻 button; overlay hotkey restores                                     |
| Per-meeting suggestion log                                      | ✅     | Transcript / Suggestions tabs                                          |
| Audio recording (local WAV)                                     | ✅     | on by default (feeds re-diarization); Settings toggle                  |
| Windows installer                                               | ✅     | `npm run dist` → release/Sanas Setup.exe                               |
| Meeting search (across jobs)                                    | ✅     | Search page, snippet highlight                                         |
| Export (markdown transcript/summary)                            | ✅     | Export button in meeting view                                          |
| Overlay opacity slider                                          | ✅     | Settings, live-applied                                                 |
| Ask-your-history chat ("what did we decide about X?")           | 💤     | post-v1, RAG over segments                                             |
| Visual identity (tokens, control vocabulary, transcript gutter) | ✅     | dark by design; teal = room/app, sand = your voice (2026-09-09)        |
| Browser preview with a typed mock bridge (`npm run dev:web`)    | ✅     | dev only; scripted live meeting, `overlay.html?demo=live`              |
