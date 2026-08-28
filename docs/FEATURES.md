# Sanas — Features

*Capability inventory. Status: ✅ done · 🔨 in progress · 📋 planned · 💤 deferred*

## Core loop
| Feature | Status | Notes |
|---|---|---|
| Mic capture → 16 kHz PCM stream | ✅ | AudioWorklet (static file; AGC/EC/NS off) |
| Deepgram streaming transcription | ✅ | nova-3, diarize, interims, keepalive |
| Glossary → STT keyterm boosting | ✅ | per selected job |
| Live transcript view (overlay + main) | ✅ | interims live, finals persisted |
| "That's me" speaker pinning | ✅ | session-scoped; re-labels past segments |
| Ambient AI nudges (question/moment detection) | ✅ | non-user questions, 20s debounce, effort=low |
| On-demand full answer (global hotkey) | ✅ | Ctrl+Shift+Enter or "Answer now" button |
| Always-on-top overlay window | ✅ | frameless, screen-saver level, hotkey toggle, position memory |
| Deepgram auto-reconnect | ✅ | backoff, monotonic timestamps across reconnects |

## Organization
| Feature | Status | Notes |
|---|---|---|
| Jobs (create/edit/archive) | ✅ | archive UI pending, repo supports it |
| Job context pack: company info, project scope, notes, talking points, persona/tone | ✅ | feeds AI in Phase 3 |
| Per-job glossary (terms + notes) | ✅ | feeds STT now, AI in Phase 3 |
| Meetings under a job; transcript view | ✅ | job picker on Live, history per job |
| Post-meeting summary + action items | ✅ | fire-and-forget on stop; shown in meeting view |
| Audio recording per meeting (opt-in) | 📋 | local files |

## App
| Feature | Status | Notes |
|---|---|---|
| Settings: API keys, hotkey, audio device | ✅ | keys main-process only, masked view to renderer |
| SQLite storage + v1 schema + migrations | ✅ | %APPDATA%/sanas/sanas.db, WAL |
| Retention controls | 📋 | Phase 4 |
| Overlay ghost mode (click-through) | ✅ | 👻 button; overlay hotkey restores |
| Per-meeting suggestion log | ✅ | Transcript / Suggestions tabs |
| Audio recording (opt-in, local WAV) | ✅ | off by default |
| Windows installer | ✅ | `npm run dist` → release/Sanas Setup.exe |
| Meeting search (across jobs) | 💤 | post-v1 |
| Export (markdown transcript/summary) | 💤 | post-v1 |
| Ask-your-history chat ("what did we decide about X?") | 💤 | post-v1, RAG over segments |
