# Sanas — Features

*Capability inventory. Status: ✅ done · 🔨 in progress · 📋 planned · 💤 deferred*

## Core loop
| Feature | Status | Notes |
|---|---|---|
| Mic capture → 16 kHz PCM stream | 📋 | AudioWorklet in renderer |
| Deepgram streaming transcription | 📋 | diarize, interims, smart_format |
| Glossary → STT keyterm boosting | 📋 | per active job |
| Live transcript view (overlay + main) | 📋 | interims live, finals persisted |
| "That's me" speaker pinning | 📋 | map diarized speaker → user |
| Ambient AI nudges (question/moment detection) | 📋 | debounced, short |
| On-demand full answer (global hotkey) | 📋 | |
| Always-on-top overlay window | 📋 | frameless, summon/dismiss hotkey |

## Organization
| Feature | Status | Notes |
|---|---|---|
| Jobs (create/edit/archive) | 📋 | |
| Job context pack: company info, project scope, notes, talking points, persona/tone | 📋 | feeds every AI call |
| Per-job glossary (terms + notes) | 📋 | feeds AI **and** STT |
| Meetings under a job; transcript + suggestion log | 📋 | |
| Post-meeting summary + action items | 📋 | one Claude call at meeting end |
| Audio recording per meeting (opt-in) | 📋 | local files |

## App
| Feature | Status | Notes |
|---|---|---|
| Settings: API keys, hotkeys, audio device, retention | 📋 | keys main-process only |
| Meeting search (across jobs) | 💤 | post-v1 |
| Export (markdown transcript/summary) | 💤 | post-v1 |
| Ask-your-history chat ("what did we decide about X?") | 💤 | post-v1, RAG over segments |
