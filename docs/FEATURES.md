# Sanas — Features

_Capability inventory. Status: ✅ done · 🔨 in progress · 📋 planned · 💤 deferred_

## Core loop

Initial automatic, typed and captured-screen answers share a compact prompt contract: a
speakable lead, at most two supporting points, target 80 prose words excluding one runnable
minimal code replacement. Missing personal facts use labelled placeholders and a structure
to fill; longer expansion stays in More detail. These are model instructions, not runtime
truncation or a guarantee of model compliance. Batch transcripts split at speaker changes
and pauses of at least two seconds; streaming behavior is unchanged.

| Feature                                          | Status | Notes                                                                                                                |
| ------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------- |
| Mic capture → 16 kHz PCM stream                  | ✅     | AudioWorklet (static file; AGC/EC/NS off)                                                                            |
| Deepgram streaming transcription                 | ✅     | nova-3, diarize, interims, keepalive                                                                                 |
| Glossary → STT keyterm boosting                  | ✅     | per selected job                                                                                                     |
| Live transcript view (overlay + main)            | ✅     | interims live, finals persisted                                                                                      |
| "That's me" speaker pinning                      | ✅     | per meeting (Elsewhere mode); re-labels past segments; survives re-diarization                                       |
| Pause / resume a meeting                         | ✅     | one meeting across an interruption; clock is audio time (2026-09-09)                                                 |
| Merge meetings                                   | ✅     | job page: tick two or more, folded into the earliest; wall-clock offsets, speaker blocks (2026-09-09)                |
| Lost connection pauses instead of erroring       | ✅     | after the provider's own retries; Resume when back online (2026-09-09)                                               |
| Ambient AI nudges (completed-turn detection)     | ✅     | Smart/Full/Points; classifies completed turns; suppresses recently repeated answers; configurable models/cooldown    |
| Next point while you talk                        | ✅     | opt-in (off by default); ≥1 per 30 s; labelled "Next point" in overlay, history and export                           |
| System-audio capture warning                     | ✅     | This PC mode: banner when ch1 is silent but the mic hears speech; advisory only                                      |
| Live whisper history                             | ✅     | Per-meeting history with previous/next/Latest; follows new answers unless reading an older/scrolled item             |
| Stacked questions answered together              | ✅     | Back-to-back questions yield one combined suggestion (max 3, within 30 s); covered ones are not re-asked             |
| On-demand full answer (global hotkey)            | ✅     | Ctrl+Shift+Enter or "Answer now"; runs beside an ambient nudge, opens its answer, 60 s timeout                       |
| Always-on-top overlay window                     | ✅     | frameless, position/size memory, resize grips; requests current meeting state when opened                            |
| Answer-first overlay with workspace rail         | ✅     | Answer · Ask · Screen · Slide · Transcript · Context; answer preview + draggable divider above the rest (2026-11-01) |
| Overlay local shortcuts                          | ✅     | while focused: Ctrl+1–6 workspaces, Ctrl+, preferences, Esc back to Answer; listed in Settings → Hotkeys             |
| Overlay hidden from screen capture               | ✅     | always excluded from screen shares, screenshots and recordings; no toggle                                            |
| Deepgram auto-reconnect                          | ✅     | backoff, monotonic timestamps across reconnects                                                                      |
| System-audio loopback capture                    | ✅     | same-PC meetings; ch0=me ch1=them via multichannel                                                                   |
| Post-meeting batch re-diarization                | ✅     | stable speaker labels; needs recordAudio (default on)                                                                |
| Speaker rename + merge                           | ✅     | per meeting, in transcript view; export uses names                                                                   |
| Meeting source per meeting (This PC / Elsewhere) | ✅     | Live page, remembered; Elsewhere = mono + "that's me" pinning                                                        |
| Pins + names carried across re-diarization       | ✅     | time-overlap remap (speaker-carryover)                                                                               |
| Speaker names in summaries + assist prompts      | ✅     | user-assigned names replace S1/S2 wherever the transcript is rendered                                                |

## Organization

| Feature                                                                            | Status | Notes                                                                                                                  |
| ---------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| Jobs (create/edit/archive)                                                         | ✅     | Overview (name/context/glossary), Presentation, Email, Meetings sub-tabs; drafts survive switching; archive UI pending |
| Job context pack: company info, project scope, notes, talking points, persona/tone | ✅     | feeds AI in Phase 3                                                                                                    |
| Per-job glossary (terms + notes)                                                   | ✅     | bulk paste on the glossary row; feeds STT now and AI in Phase 3                                                        |
| Meetings under a job; transcript view                                              | ✅     | job picker on Live, history per job, rename, move to another job                                                       |
| Post-meeting knowledge summary + action items                                      | ✅     | sectioned Markdown knowledge extract; detail scales with transcript length; fire-and-forget on stop                    |
| On-demand summary (Summarize / Regenerate)                                         | ✅     | stored transcript (capped ~120k chars) + job context; timeout-safe generation                                          |
| Email summary to the job's address                                                 | ✅     | recipient per job; SMTP (nodemailer); button + auto-send on stop                                                       |

## App

| Feature                                                                  | Status | Notes                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings: API keys, assistant mode/models/cooldown, hotkeys, audio, SMTP | ✅     | Smart/Full/Points; nudge/answer/question-detection models; answer cooldown; "Next point while I'm talking"; secrets stay main-only                                                             |
| SQLite storage + v7 schema + migrations                                  | ✅     | %APPDATA%/sanas/sanas.db, WAL                                                                                                                                                                  |
| Startup recovery for unfinished meetings                                 | ✅     | Closes crash/reload leftovers at their last persisted segment                                                                                                                                  |
| Retention controls                                                       | ✅     | audio after N days / whole meetings after N days; timer + Clean up now                                                                                                                         |
| Overlay ghost mode (click-through)                                       | ✅     | ghost icon button; the configured overlay hotkey restores (named in the header)                                                                                                                |
| Per-meeting suggestion log                                               | ✅     | Transcript / Suggestions tabs                                                                                                                                                                  |
| Audio recording (local WAV)                                              | ✅     | on by default (feeds re-diarization); Settings toggle                                                                                                                                          |
| Windows installer                                                        | ✅     | `npm run dist` → release/Sanas Setup.exe                                                                                                                                                       |
| Meeting search (across jobs)                                             | ✅     | FTS5 ranked + stemmed, matched terms marked (2026-09-09)                                                                                                                                       |
| Export (markdown transcript/summary)                                     | ✅     | Export button in meeting view                                                                                                                                                                  |
| Overlay opacity slider                                                   | ✅     | Overlay preferences (⋯ button, Ctrl+,) + Settings, live-applied and kept in sync                                                                                                               |
| Ask-your-history ("what did we decide about X?")                         | ✅     | Ask page: FTS5 retrieval + cited, streamed answer; job scope (2026-09-09)                                                                                                                      |
| Visual identity (tokens, control vocabulary, transcript gutter)          | ✅     | dark by design; teal = room/app, sand = your voice; slim dark scrollbars                                                                                                                       |
| Library app header                                                       | ✅     | top bar that is also the window title bar (native min/max/close in its right end, drag to move): Sanas mark, page tabs, status pill → Live, Overlay toggle (2026-11-01)                        |
| Settings layout and save states                                          | ✅     | one page per section, animated switch (reduced-motion fade), Up/Down in the index, attention dots; save bar on every page: unsaved / fix-field / saving / saved / failed, Discard (2026-11-01) |
| Browser preview with a typed mock bridge (`npm run dev:web`)             | ✅     | dev only; scripted live meeting, `overlay.html?demo=live`; fixed overlay states via `overlay.html?scenario=<name>`                                                                             |

## Presentation mode

Jobs can save up to 100 ordered slides with title, talking point, optional script and key facts. Add/edit/reorder/remove, or paste headings/labelled fields and inspect the import preview before appending or replacing the draft. Save is separate from import.

New meetings snapshot the deck. The overlay's Slide workspace (rail, Ctrl+4 while focused) offers a scrolling plain-text teleprompter and Previous/Next controls. Configurable defaults: CommandOrControl+Alt+PageUp / PageDown. Navigation is manual, recorded, and independent of the owner's presentation app.

Answers continue to use all job context and slides; Next point alone coaches the current slide against finalized user speech. Adding a deck does not turn on coaching. Navigation keeps answers and clears old coach cards. No-slide meetings retain their existing behavior.

Meeting history, exports and summaries show timestamped slide markers. Presentation merges are not supported.

## Live presentation controls

During a live or paused meeting, open Context in the overlay rail (Ctrl+6 while focused) for quick, text-only edits to the meeting-only background (Apply never changes slides; an Unsaved badge, Reload saved and conflict notice keep the draft safe), or the Live page editor to edit the background and the meeting's slides, then Apply to this meeting. The overlay's **Open Sanas** (idle answer, Context, Slide empty state, meeting error) reveals the main window on its current page — restored if minimized, never reloaded. Ask the audience is in both Ask and Slide. Continue from slide is explicit; Restore meeting-start slides uses the original meeting snapshot. Edits reset Next point coaching but answers already started finish against their captured context.

Ask? or Ctrl+Shift+K opens the typed composer. Enter submits, Shift+Enter adds a line, IME Enter remains composition, and Escape closes/releases focus while keeping the draft. Rejected requests keep their drafts. Ask the audience suggests one question grounded in recent finalized discussion; without speech it reports that there is no discussion yet. More detail creates/selects a linked expansion using the source answer's original grounding, with Back to source navigation.

**Capture screen** (overlay button, or Ctrl+Shift+S, configurable in Settings → Hotkeys) captures the display under the overlay during a live or paused meeting and asks for an explanation in the meeting's context. The shortcut reveals the overlay without stealing focus; the overlay shows "Capturing…", then "Screen captured: <display> — analyzing…", or a readable failure. Code, stack traces, errors and failing tests get the visible error, the likely cause (visible vs inferred), a minimal fix in one code block and a verification step; slides, diagrams and apps get an explanation. Unreadable text is reported rather than invented. The composer's **Attach screen / Replace / Remove** keeps one screenshot draft per meeting (shown as a thumbnail) to send with the typed question; a rejected send keeps both. Screen answers show as "Screen answer", render in full in overlay and history, and allow More detail from the saved text. Screenshots are never saved.

Answer every question is a meeting toggle, defaulting OFF from Settings. It includes classifier verdicts directed to other participants while preserving automatic pacing. The capture warning remains visible outside tabs. Saved meeting history and exports retain context, typed requests and source/detail relationships; older live cards indicate when they use earlier context.

## Releases and updates

Windows x64 one-click NSIS installers are built by manual GitHub Actions dispatch. Packaged Sanas
checks the public GitHub release feed on launch and every six hours, downloads stable updates, and
shows installed/available versions, progress and recoverable errors in Settings → Updates. Restart
to update is explicit and disabled during live/paused meetings and background meeting writes.
Development and packaged smoke perform no update checks. Ordinary quit installs nothing.

Storage is schema v7: v6 presentation snapshots/events plus v7 immutable context/deck revisions and
saved assistance grounding. Startup backs up existing older databases before migration and rejects
newer schemas without opening the application.

## Meeting rehearsal harness

Implemented: isolated versioned JSON scenarios for client check-in, slide presentation,
standup, mock job interview, visual coding interview and rapid-fire Q&A; deterministic scripted STT and canned assistant; real lifecycle/persistence/summary
and per-expectation reports; optional production overlay. Audio replay/Windows offline TTS,
real Deepgram streaming/batch, optional Claude, real desktop fixture capture and fault injection
are available for owner runs. Paid legs and physical desktop behavior require owner acceptance;
unit tests cover their seams. See [REHEARSAL.md](REHEARSAL.md).

The coding interview includes locally rendered JavaScript and SQL screens, a screenshot-dependent
follow-up and a two-part complexity/improvement question. Assistant-scoped expectations separate
Claude concept checks from shared screen-delivery checks.

## Mock interview

Setup offers the shared **Resume for this meeting** input: paste text or import PDF/DOCX.
The attachment is validated and saved with the practice meeting, and its draft clears only
after successful Start. A practice meeting without an attachment shows **No resume** in
the overlay status. Open behavioural answers are instructed to name a concrete project or
employer from candidate facts, with compact problem/action/result support; absent facts
produce an explicit limitation notice rather than advice to pick a story.

Implemented; real-device/provider acceptance remains owner-only. Choose **Job interview**
(behavioural, technical, coding screens; 15-minute cap) or **Client Q&A** (10-minute cap),
choose a job, then Start. Saved app keys are used; missing keys link to Settings. Headphones
are recommended because the raw mic has no echo cancellation. A separate interviewer window
speaks using a local Windows voice, shows captions/status and shared fixtures, and offers
Skip / End / Dismiss share. Replies use the real mic and follow-ups use only finalized speech.

Start creates a normal This PC practice meeting automatically. Closing the interviewer or
library, Stop/Pause or End stops it. The tab shows question-by-question delivery, latency,
word counts and missing-suggestion evidence, and past practice sessions with complete records.
Practice is excluded from normal history/Search/Ask and auto-email, and cannot be merged.
The retired `-Tier live` command points here. Scripted/audio harnesses remain gated.

Interview context packs use Notes for verified candidate experience and provenance, Project scope for the target role, Company info for the client and Persona for delivery. The editor shows guidance and an empty-Notes cue. Live missing-fact replies clarify or defer checking; preparation and More detail may offer labelled templates. Fictional practice data is never candidate biography.

Initial answers in both automatic and Answer now lanes match the ask: screening, experience, rate and availability checks target 15-40 grounded words. Technical nouns alone do not invite code; implementation requests or essential exact artifacts can. Answer now selects immediate assistance and model capacity, not mandatory elaboration. More detail retains source grounding and its expansion contract.

## Resume for this meeting

Start accepts an optional PDF/DOCX file (up to 5 MB) or pasted resume text independently of the job and presentation toggle, including Unsorted calls. The draft shows its name, character count and preview, can be removed, and clears after a successful Start. Empty or over-40,000-character drafts cannot start. Saved text is read-only in meeting history.

Candidate facts ground answers with or without slides, survive later deck changes and More detail replay, and supply deterministic terminology hints such as Camunda to transcription. Resumes belong to one meeting; they are not remembered for the next call or shared as a reusable library. The native file picker extracts text offline in main, shows the file name, and keeps the existing draft on cancellation or failure. Start and edits wait for import to finish. Empty/scanned PDFs ask the user to paste text; extracted text uses the same 40,000-character validation. No source binary or path is saved.
