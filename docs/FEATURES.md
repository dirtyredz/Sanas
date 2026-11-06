# Sanas — Features

_Capability inventory. Status: ✅ done · 🔨 in progress · 📋 planned · 💤 deferred_

## Core loop

Initial automatic, typed and captured-screen answers share a compact prompt contract: a
speakable lead, at most two supporting points, target 80 prose words excluding one runnable
minimal code replacement. Missing personal facts are filled with a plausible first-person answer; improvised
phrases are wrapped in ⟨…⟩ and shown dimmed in the overlay and history (stripped in exports);
longer expansion stays in More detail. These are model instructions, not runtime
truncation or a guarantee of model compliance. Batch transcripts split at speaker changes
and pauses of at least two seconds; streaming behavior is unchanged.

| Feature                                          | Status | Notes                                                                                                                                                                                             |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mic capture → 16 kHz PCM stream                  | ✅     | AudioWorklet (static file; AGC/EC/NS off)                                                                                                                                                         |
| Deepgram streaming transcription                 | ✅     | nova-3, diarize, interims, keepalive                                                                                                                                                              |
| Glossary → STT keyterm boosting                  | ✅     | per selected job                                                                                                                                                                                  |
| Live transcript view (overlay + main)            | ✅     | interims live, finals persisted                                                                                                                                                                   |
| "That's me" speaker pinning                      | ✅     | per meeting (Elsewhere mode); re-labels past segments; survives re-diarization                                                                                                                    |
| Pause / resume a meeting                         | ✅     | one meeting across an interruption; clock is audio time (2026-09-09)                                                                                                                              |
| Merge meetings                                   | ✅     | job page: tick two or more, folded into the earliest; wall-clock offsets, speaker blocks (2026-09-09)                                                                                             |
| Lost connection pauses instead of erroring       | ✅     | after the provider's own retries; Resume when back online (2026-09-09)                                                                                                                            |
| Ambient AI nudges (completed-turn detection)     | ✅     | Smart/Full/Points; classifies completed turns; answers anchor on the current question (earlier talk is background) and avoid re-telling stories already told this meeting; shown only if accepted |
| Next point while you talk                        | ✅     | opt-in (off by default); ≥1 per 30 s; continues the project Me is explaining, never introduces new tech; labelled "Next point" in overlay, history and export                                     |
| System-audio capture warning                     | ✅     | This PC mode: banner when ch1 is silent but the mic hears speech; advisory only                                                                                                                   |
| Live whisper history                             | ✅     | Per-meeting history with previous/next/Latest; follows new answers unless reading an older/scrolled item                                                                                          |
| Stacked questions answered together              | ✅     | Back-to-back questions yield one combined suggestion (max 3, within 30 s); covered ones are not re-asked                                                                                          |
| On-demand full answer (global hotkey)            | ✅     | Ctrl+Shift+Enter or "Answer now"; answers the latest question (<= 90 s old), earlier talk as background; runs beside an ambient nudge, opens its answer, 60 s timeout                             |
| Speculative automatic answers (all verdicts)     | ✅     | one neutral prompt built beside the classifier; promoted for all six accepted verdicts when nothing moved (2026-11-05)                                                                            |
| Stage-timing evidence                            | ✅     | allowlisted per-candidate latency records and summary in the main log, rehearsal report and Mock; no text                                                                                         |
| Always-on-top overlay window                     | ✅     | frameless, position/size memory, resize grips; requests current meeting state when opened                                                                                                         |
| Answer-first overlay with workspace rail         | ✅     | Answer · Ask · Screen · Transcript · Context; answer preview + draggable divider above the rest (Slide retired 2026-11-04)                                                                        |
| Overlay local shortcuts                          | ✅     | while focused: Ctrl+1–3, 5, 6 workspaces (Ctrl+4 unbound since Slide was retired), Ctrl+, preferences, Esc back to Answer; listed in Settings → Hotkeys                                           |
| Overlay hidden from screen capture               | ✅     | always excluded from screen shares, screenshots and recordings; no toggle                                                                                                                         |
| Deepgram auto-reconnect                          | ✅     | backoff, PCM-anchored timestamps across reconnects (WAV clock)                                                                                                                                    |
| Stalled-STT recovery                             | ✅     | 9 s without Results while audio flows retires the socket and reconnects; lost text is not replayed; long-silence behaviour awaits live check                                                      |
| System-audio loopback capture                    | ✅     | same-PC meetings; ch0=me ch1=them via multichannel                                                                                                                                                |
| Post-meeting batch re-diarization                | ✅     | stable speaker labels; needs recordAudio (default on)                                                                                                                                             |
| Speaker rename + merge                           | ✅     | per meeting, in transcript view; export uses names                                                                                                                                                |
| Meeting source per meeting (This PC / Elsewhere) | ✅     | Live page, remembered; Elsewhere = mono + "that's me" pinning                                                                                                                                     |
| Pins + names carried across re-diarization       | ✅     | time-overlap remap (speaker-carryover)                                                                                                                                                            |
| Speaker names in summaries + assist prompts      | ✅     | user-assigned names replace S1/S2 wherever the transcript is rendered                                                                                                                             |

## Organization

| Feature                                                                            | Status | Notes                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jobs (create/edit/archive)                                                         | ✅     | Overview (name/context/glossary), Resume, Email, Meetings sub-tabs; drafts survive switching; archive via a closed application; manual archive UI pending                 |
| Job context pack: company info, project scope, notes, talking points, persona/tone | ✅     | feeds AI in Phase 3                                                                                                                                                       |
| Per-job glossary (terms + notes)                                                   | ✅     | bulk paste on the glossary row; feeds STT now and AI in Phase 3                                                                                                           |
| Meetings under a job; transcript view                                              | ✅     | job picker on Live, history per job, rename, move to another job                                                                                                          |
| Post-meeting knowledge summary + action items                                      | ✅     | sectioned Markdown knowledge extract; detail scales with transcript length; fire-and-forget on stop                                                                       |
| On-demand summary (Summarize / Regenerate)                                         | ✅     | stored transcript (capped ~120k chars) + job context; timeout-safe generation                                                                                             |
| Email summary to the job's address                                                 | ✅     | recipient per job; SMTP (nodemailer); button + auto-send on stop                                                                                                          |
| New job from application                                                           | ✅     | Jobs page picker over resumes interview packs, preview then Create; built, producer CLI (`sanas-packs.js`) pending; missing CLI falls back to existing packs (2026-11-06) |
| Refresh from application: review and archive offer                                 | ✅     | job-page three-way review, conflicts default to Keep Sanas; stage changes reviewed; closed offers "Archive linked job" (2026-11-06)                                       |
| Draft-at-import                                                                    | ✅     | empty talking points/persona/glossary/company info drafted once at create from notes, never the resume; "Drafted by Sanas", editable; refresh never drafts (2026-11-06)   |
| Job deletion with counts                                                           | ✅     | "Delete job…" cascades to meetings, recordings and context; exact counts, DB backup first, default Cancel; Unsorted undeletable (2026-11-06)                              |
| Show archived jobs                                                                 | ✅     | Jobs page toggle; `jobs:list` takes `{ includeArchived }` (2026-11-06)                                                                                                    |
| Settings → Applications                                                            | ✅     | `resumesRoot` (default `C:\Users\dirty\projects\resumes`) and `resumesNodeExecutable` (default `node.exe`) (2026-11-06)                                                   |

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

## Presentation mode — retired 2026-11-04

Removed by owner decision: no job decks, slide import, Slide workspace, Previous/Next
navigation, slide hotkeys, deck checkbox or slide-scoped coaching. Meetings recorded before then
keep their timestamped slide markers read-only in meeting history, exports and regenerated
summaries; no data was deleted. Meetings with recorded slides cannot be merged. Saved
presentation hotkeys are ignored and dropped on the next settings save.

## Meeting context and live controls

**Before Start**, the Live page has a **Meeting context** box beside the job picker (agenda,
attendees, goals, talking points; works with Unsorted). The text is saved with the meeting at
Start as its first context revision. The draft survives tab switches, job changes and a failed
capture or Start; it is disabled while Start is pending and cleared once the meeting is live.
It is not kept across an app restart.

**During a live or paused meeting**, edit the same saved text from the Live page's Meeting
context editor or the overlay's Context (rail, Ctrl+6 while focused): an Unsaved badge, Reload
saved and a conflict notice keep the draft safe; Apply to this meeting saves a new revision.
Edits apply to later answers and coaching at once; answers already started finish against their
captured context, and a pending Next point built on the old context is dropped. The overlay's
**Open Sanas** (idle answer, Context, meeting error) reveals the main window on its current
page — restored if minimized, never reloaded.

Ask? or Ctrl+Shift+K opens the typed composer. Enter submits, Shift+Enter adds a line, IME Enter remains composition, and Escape closes/releases focus while keeping the draft. Rejected requests keep their drafts. Ask the audience (in Ask) suggests one question grounded in recent finalized discussion; without speech it reports that there is no discussion yet. More detail creates/selects a linked expansion using the source answer's original grounding, with Back to source navigation.

**Capture screen** (overlay button, or Ctrl+Shift+S, configurable in Settings → Hotkeys) captures the display under the overlay during a live or paused meeting and asks for an explanation in the meeting's context. The shortcut reveals the overlay without stealing focus; the overlay shows "Capturing…", then "Screen captured: <display> — analyzing…", or a readable failure. Code, stack traces, errors and failing tests get the visible error, the likely cause (visible vs inferred), a minimal fix in one code block and a verification step; slides, diagrams and apps get an explanation. Unreadable text is reported rather than invented. The composer's **Attach screen / Replace / Remove** keeps one screenshot draft per meeting (shown as a thumbnail) to send with the typed question; a rejected send keeps both. Screen answers show as "Screen answer", render in full in overlay and history, and allow More detail from the saved text. Screenshots are never saved.

Answer every question is a meeting toggle, defaulting OFF from Settings. It includes classifier verdicts directed to other participants while preserving automatic pacing. The capture warning remains visible outside tabs. Saved meeting history and exports retain context, typed requests and source/detail relationships; older live cards indicate when they use earlier context.

**Merging** meetings with context: allowed when at most one of the selected meetings has
meeting context (nonempty initial text or any applied revision, a later clear included). The
merged meeting keeps that context history, placed at that part's time on the merged timeline.
Two or more meetings with context are refused with a readable message.

## Releases and updates

Windows x64 one-click NSIS installers are built by manual GitHub Actions dispatch. Packaged Sanas
checks the public GitHub release feed on launch and every six hours, downloads stable updates, and
shows installed/available versions, progress and recoverable errors in Settings → Updates. Restart
to update is explicit and disabled during live/paused meetings and background meeting writes.
Development and packaged smoke perform no update checks. Ordinary quit installs nothing.

Storage is schema v12 (v6–v7 presentation snapshots and context revisions, v8 practice, v9–v12
resume/profile snapshots and guards). Presentation tables remain for historical records only. Startup backs up existing older databases before migration and rejects
newer schemas without opening the application.

## Meeting rehearsal harness

Implemented: isolated versioned JSON scenarios for client check-in, meeting-context delivery,
standup, mock job interview, visual coding interview and rapid-fire Q&A; deterministic scripted STT and canned assistant; real lifecycle/persistence/summary
and per-expectation reports; optional production overlay. Audio replay/Windows offline TTS,
real Deepgram streaming/batch, optional Claude, real desktop fixture capture and fault injection
are available for owner runs. Paid legs and physical desktop behavior require owner acceptance;
unit tests cover their seams. See [REHEARSAL.md](REHEARSAL.md).

The coding interview includes locally rendered JavaScript and SQL screens, a screenshot-dependent
follow-up and a two-part complexity/improvement question. Assistant-scoped expectations separate
Claude concept checks from shared screen-delivery checks.

## Mock interview

Setup has no resume input: the practice meeting snapshots the selected job's saved resume
(Jobs → job → **Resume**) at Start, with no per-session override. A practice meeting with
neither a resume nor an Interview profile shows **No resume or profile** in the overlay
status. Open behavioural answers are instructed to name a concrete project from candidate facts
(or plausible marked filler when there are none), with compact problem/action/result support.

Implemented; real-device/provider acceptance remains owner-only. Choose **Job interview**
(behavioural, technical, coding screens; 15-minute cap) or **Client Q&A** (10-minute cap),
choose a job, then Start. Saved app keys are used; missing keys link to Settings. Headphones
are recommended because the raw mic has no echo cancellation. A separate interviewer window
speaks using a local Windows voice, shows captions/status and shared fixtures, and offers
Skip / End / Dismiss share. Replies use the real mic and follow-ups use only finalized speech.

The interviewer waits for the candidate: silence does not count until the candidate has spoken (user-role interim or final text), then it moves on after 4 s of candidate silence. If nobody speaks for 30 s it prompts once ("Take your time — whenever you are ready."); Skip (Ctrl+Alt+Right) always works.
Start creates a normal This PC practice meeting automatically. Closing the interviewer or
library, Stop/Pause or End stops it. The tab shows question-by-question delivery, latency,
word counts and missing-suggestion evidence, and past practice sessions with complete records.
Practice is excluded from normal history/Search/Ask and auto-email, and cannot be merged.
The retired `-Tier live` command points here. Scripted/audio harnesses remain gated.

Interview context packs use Notes for verified candidate experience and provenance, Project scope for the target role, Company info for the client and Persona for delivery. The editor shows guidance and an empty-Notes cue. Live answers never stall or defer: missing facts become plausible, hedged filler marked ⟨…⟩. Fictional practice data is never candidate biography.

Initial answers in both automatic and Answer now lanes match the ask: screening, experience, rate and availability checks target 15-40 grounded words. Technical nouns alone do not invite code; implementation requests or essential exact artifacts can. Answer now selects immediate assistance and model capacity, not mandatory elaboration. More detail retains source grounding and its expansion contract.

## Job resume — implemented

Each job has an optional saved resume on its **Resume** tab (after Overview): paste text or
import a PDF/DOCX (up to 5 MB), name it, see the character count and a preview, replace or
remove it, then **Save resume** (its own button; the header Save does not
cover it). Import and edits are a draft until saved; a cancelled or failed import, or a failed
save, keeps the draft. Empty or over-40,000-character drafts cannot be saved. One job per
interview: the resume belongs to the job, not to each Start.

Every new Live or Mock meeting for that job copies the saved resume at Start. Live and Mock
setup have no resume input. Unsorted (no job) meetings start without one. Later edits or
removal change only future meetings; the meeting's copy is read-only in history, including
meetings recorded before job resumes existed. Past meetings are not copied into jobs. Filing a
meeting under a different job removes its resume and Interview-profile copy (it came from the old
job), which also makes it mergeable again.

Candidate facts ground answers with or without meeting context, survive later context changes and More detail replay, and supply deterministic terminology hints such as Camunda to transcription. The native file picker extracts text offline in main and shows the file name. Empty/scanned PDFs ask the user to paste text. No source binary or path is saved.

## Interview profile — implemented

Settings → Interview profile saves reusable plain text locally, with guidance for About me,
Go-to stories (problem / what I did / result), Strengths and weaknesses, Why I'm looking,
Rate and availability, and Anything else. Save once, then edit when your experience changes.

Mock interview always uses the saved profile. Live Start has an Interview checkbox: it defaults on when the selected job has a saved resume (off for
Unsorted), and your explicit choice wins; choosing another job resets it to that job's default.
Ordinary work meetings do not receive the profile. Each applicable Start saves an immutable
snapshot; later profile edits do not change past meetings. History shows when one was used.
The meeting's resume facts win over general profile stories, and marked plausible filler fills
remaining gaps. Employer and technology terms also feed transcription hints. Practice shows
“No resume or profile” only when both are empty. Deterministic wiring is tested; model-backed
quality is NOT VERIFIED.
