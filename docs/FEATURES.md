# Sanas — Features

_Capability inventory. Status: ✅ done · 🔨 in progress · 📋 planned · 💤 deferred_

## Core loop

| Feature                                          | Status | Notes                                                                                                             |
| ------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------- |
| Mic capture → 16 kHz PCM stream                  | ✅     | AudioWorklet (static file; AGC/EC/NS off)                                                                         |
| Deepgram streaming transcription                 | ✅     | nova-3, diarize, interims, keepalive                                                                              |
| Glossary → STT keyterm boosting                  | ✅     | per selected job                                                                                                  |
| Live transcript view (overlay + main)            | ✅     | interims live, finals persisted                                                                                   |
| "That's me" speaker pinning                      | ✅     | per meeting (Elsewhere mode); re-labels past segments; survives re-diarization                                    |
| Pause / resume a meeting                         | ✅     | one meeting across an interruption; clock is audio time (2026-09-09)                                              |
| Merge meetings                                   | ✅     | job page: tick two or more, folded into the earliest; wall-clock offsets, speaker blocks (2026-09-09)             |
| Lost connection pauses instead of erroring       | ✅     | after the provider's own retries; Resume when back online (2026-09-09)                                            |
| Ambient AI nudges (completed-turn detection)     | ✅     | Smart/Full/Points; classifies completed turns; suppresses recently repeated answers; configurable models/cooldown |
| Next point while you talk                        | ✅     | opt-in (off by default); ≥1 per 30 s; labelled "Next point" in overlay, history and export                        |
| System-audio capture warning                     | ✅     | This PC mode: banner when ch1 is silent but the mic hears speech; advisory only                                   |
| Live whisper history                             | ✅     | Per-meeting history with previous/next/Latest; follows new answers unless reading an older/scrolled item          |
| On-demand full answer (global hotkey)            | ✅     | Ctrl+Shift+Enter or "Answer now"; runs beside an ambient nudge, opens its answer, 60 s timeout                    |
| Always-on-top overlay window                     | ✅     | frameless, position/size memory, resize grips; requests current meeting state when opened                         |
| Overlay hidden from screen capture               | ✅     | always excluded from screen shares, screenshots and recordings; no toggle                                         |
| Deepgram auto-reconnect                          | ✅     | backoff, monotonic timestamps across reconnects                                                                   |
| System-audio loopback capture                    | ✅     | same-PC meetings; ch0=me ch1=them via multichannel                                                                |
| Post-meeting batch re-diarization                | ✅     | stable speaker labels; needs recordAudio (default on)                                                             |
| Speaker rename + merge                           | ✅     | per meeting, in transcript view; export uses names                                                                |
| Meeting source per meeting (This PC / Elsewhere) | ✅     | Live page, remembered; Elsewhere = mono + "that's me" pinning                                                     |
| Pins + names carried across re-diarization       | ✅     | time-overlap remap (speaker-carryover)                                                                            |
| Speaker names in summaries + assist prompts      | ✅     | user-assigned names replace S1/S2 wherever the transcript is rendered                                             |

## Organization

| Feature                                                                            | Status | Notes                                                                                               |
| ---------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| Jobs (create/edit/archive)                                                         | ✅     | archive UI pending, repo supports it                                                                |
| Job context pack: company info, project scope, notes, talking points, persona/tone | ✅     | feeds AI in Phase 3                                                                                 |
| Per-job glossary (terms + notes)                                                   | ✅     | bulk paste on the glossary row; feeds STT now and AI in Phase 3                                     |
| Meetings under a job; transcript view                                              | ✅     | job picker on Live, history per job, rename, move to another job                                    |
| Post-meeting knowledge summary + action items                                      | ✅     | sectioned Markdown knowledge extract; detail scales with transcript length; fire-and-forget on stop |
| On-demand summary (Summarize / Regenerate)                                         | ✅     | stored transcript (capped ~120k chars) + job context; timeout-safe generation                       |
| Email summary to the job's address                                                 | ✅     | recipient per job; SMTP (nodemailer); button + auto-send on stop                                    |

## App

| Feature                                                                  | Status | Notes                                                                                                                              |
| ------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Settings: API keys, assistant mode/models/cooldown, hotkeys, audio, SMTP | ✅     | Smart/Full/Points; nudge/answer/question-detection models; answer cooldown; "Next point while I'm talking"; secrets stay main-only |
| SQLite storage + v1 schema + migrations                                  | ✅     | %APPDATA%/sanas/sanas.db, WAL                                                                                                      |
| Startup recovery for unfinished meetings                                 | ✅     | Closes crash/reload leftovers at their last persisted segment                                                                      |
| Retention controls                                                       | ✅     | audio after N days / whole meetings after N days; timer + Clean up now                                                             |
| Overlay ghost mode (click-through)                                       | ✅     | 👻 button; overlay hotkey restores                                                                                                 |
| Per-meeting suggestion log                                               | ✅     | Transcript / Suggestions tabs                                                                                                      |
| Audio recording (local WAV)                                              | ✅     | on by default (feeds re-diarization); Settings toggle                                                                              |
| Windows installer                                                        | ✅     | `npm run dist` → release/Sanas Setup.exe                                                                                           |
| Meeting search (across jobs)                                             | ✅     | FTS5 ranked + stemmed, matched terms marked (2026-09-09)                                                                           |
| Export (markdown transcript/summary)                                     | ✅     | Export button in meeting view                                                                                                      |
| Overlay opacity slider                                                   | ✅     | Overlay header + Settings, live-applied and kept in sync                                                                           |
| Ask-your-history ("what did we decide about X?")                         | ✅     | Ask page: FTS5 retrieval + cited, streamed answer; job scope (2026-09-09)                                                          |
| Visual identity (tokens, control vocabulary, transcript gutter)          | ✅     | dark by design; teal = room/app, sand = your voice; slim dark scrollbars                                                           |
| Browser preview with a typed mock bridge (`npm run dev:web`)             | ✅     | dev only; scripted live meeting, `overlay.html?demo=live`                                                                          |

## Presentation mode

Jobs can save up to 100 ordered slides with title, talking point, optional script and key facts. Add/edit/reorder/remove, or paste headings/labelled fields and inspect the import preview before appending or replacing the draft. Save is separate from import.

New meetings snapshot the deck. The overlay offers Slide/Transcript tabs, a scrolling plain-text teleprompter and Previous/Next controls. Configurable defaults: CommandOrControl+Alt+PageUp / PageDown. Navigation is manual, recorded, and independent of the owner's presentation app.

Answers continue to use all job context and slides; Next point alone coaches the current slide against finalized user speech. Adding a deck does not turn on coaching. Navigation keeps answers and clears old coach cards. No-slide meetings retain their existing behavior.

Meeting history, exports and summaries show timestamped slide markers. Presentation merges are not supported.

## Live presentation controls

During a live or paused meeting, open Context in the overlay (or the Live page editor) to edit meeting-only background and slides, then Apply to this meeting. Continue from slide is explicit; Restore meeting-start slides uses the original meeting snapshot. Edits reset Next point coaching but answers already started finish against their captured context.

Ask? or Ctrl+Shift+K opens the typed composer. Enter submits, Shift+Enter adds a line, IME Enter remains composition, and Escape closes/releases focus while keeping the draft. Rejected requests keep their drafts. Ask the audience suggests one question grounded in recent finalized discussion; without speech it reports that there is no discussion yet. More detail creates/selects a linked expansion using the source answer's original grounding, with Back to source navigation.

Answer every question is a meeting toggle, defaulting OFF from Settings. It includes classifier verdicts directed to other participants while preserving automatic pacing. The capture warning remains visible outside tabs. Saved meeting history and exports retain context, typed requests and source/detail relationships; older live cards indicate when they use earlier context.
