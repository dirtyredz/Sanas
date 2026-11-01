# Sanas — Architecture

_How the system works. For code shape, see [../STRUCTURE.md](../STRUCTURE.md)._

## Overview

Electron desktop app, single-device, local-first. Two windows:

1. **Main window** — library UI: jobs, meetings, transcripts, context packs, settings.
2. **Overlay window** — small frameless always-on-top panel shown during a live meeting;
   answer-first: the selected suggestion, plus one secondary workspace (Ask, Screen, Slide,
   Transcript, Context) chosen from a rail. Summoned/dismissed by global hotkey.

### Overlay composition

`overlay-app/shell/OverlaySession.tsx` composes every controller once for the window's
lifetime — transcript/meeting state, presentation, settings, ghost/shortcut labels,
navigation, suggestion history, manual requests, the composer (draft + screen attachment),
capture status and Answer every question — and hands view models to `OverlayShell`. Views
own no subscriptions or request policy. All workspaces stay mounted (hidden ones are `inert`),
so switching never resets a draft, attachment, history selection or scroll position; a new
meeting does. The compose listener and `composerReady` handshake live in the session, above
conditional rendering: a cold-start Ask intent opens Ask and focuses the textarea once it is
available. Navigation is a pure reducer (`shell/navigation/overlay-navigation.ts`) whose only
inputs are the owner's actions and a meeting change — no answer, slide or context event can
switch the workspace, and every meeting opens on Answer. Local shortcuts (Ctrl+1–6, Ctrl+,
and Escape) are a window keydown listener; global shortcuts stay in main. In a secondary
workspace the answer is a preview above a draggable divider whose ratio persists as
`overlayWhisperRatio`; Answer gives it the whole column.

**Main-window reveal.** The overlay's Open Sanas invokes the parameterless typed channel
`MainWindowShow` (`app.showMain()` in preload; handler in `ipc/windows.ts`), which calls the
same `createMainWindow()` entry point startup and second-instance use: an existing window is
restored if minimized, shown and focused — never reloaded or routed, so the Live page and its
microphone session keep running. The overlay's Context edits text only; slides stay in the
main window's editor.

## Runtime data flow (live meeting)

```
Mic (getUserMedia, renderer)
  → PCM chunks (AudioWorklet, 16 kHz mono)
  → Deepgram streaming WebSocket        [+ keyterm boosts from the job's glossary]
  → interim + final transcript events (diarized: Speaker 0/1/…)
  → Transcript store (rolling buffer + SQLite persistence)
  → Live assistance (see Assistance):
      • ambient: completed turn → prefilter → classifier → answer;
                 opt-in "Next point" coaching while the user talks
      • hotkey:  user asks → full answer
  → Claude API (answers stream; next points buffered) with prompt = job context pack + recent transcript
  → Suggestion rendered in overlay
```

### Audio capture

- **Where the meeting is, chosen per meeting on the Live page** (remembered as
  `settings.meetingSource`):
  - **This PC** — the call plays through this machine, where driver echo-cancellation
    erases the other side from the mic, so Sanas also taps the signal headed to the
    output device via Electron's display-media loopback (`src/main/system-audio.ts`).
    Channels: **0 = mic (user), 1 = loopback (others)** — identity is structural,
    resolved in one place (`services/meetings/capture/channel-identity.ts`, returning `user | other | unknown`).
  - **Elsewhere** (another device, or in the room; the default) — mic-only mono: everyone
    arrives through the mic, voices are diarized, and the user marks their own with
    "that's me". Picking This PC for a meeting held elsewhere stamps every voice as the
    user (GOTCHAS.md) — that is why the choice is per meeting, not a global setting.
  - Loopback unavailable in This-PC mode → mono with a notice on the Live page.
- Renderer captures via `getUserMedia` (+ `getDisplayMedia` for loopback); an
  `AudioWorklet` downsamples to 16 kHz linear16, interleaved when stereo.
- Raw audio saved to a per-meeting WAV by default (feeds re-diarization; can be disabled).

### Transcription (Deepgram)

- Streaming WebSocket, `nova-3` model (or current best), `diarize=true`,
  `interim_results=true`, `smart_format=true`; `multichannel=true` in stereo mode so
  mic and loopback transcribe independently.
- The active job's **glossary terms are sent as keyterm boosts** — the same data that
  feeds the AI also improves STT accuracy on jargon. (This is the _sanas_ double meaning.)
- Interim results update the overlay live; only finals are persisted.
- Turn signals: `endpointing=600`, `utterance_end_ms=1000`, `vad_events=true`.
  `stt/deepgram-events.ts` normalizes messages into finals plus `SttSignal`s (boundary:
  endpoint | utterance-end; activity; reset) via the optional `onSignal` callback. A stereo
  message with a missing or invalid channel index becomes channel -1 (identity unknown), never
  implicitly "Me". An unexpected socket close emits `reset` at once, before the backoff.
- Speaker labels: in This-PC (stereo) mode the user is structural (channel 0); in Elsewhere
  (mono) mode the user pins their own diarized voice ("that's me"), persisted per meeting and
  carried through re-diarization by time overlap.

### Assistance (Claude)

- Models are selected in Settings and passed per request: ambient nudges default to
  `claude-sonnet-5-5`; on-demand answers, summaries and Ask-your-history default to
  `claude-opus-5-5`. Either accepts a custom model ID.
- **Prompt assembly:** system prompt = persona/tone + job context pack (company info,
  project scope, notes, talking points, glossary); user turn = recent transcript window
  (last ~N seconds/tokens) + the trigger reason and compact output contract. Suggestions
  lead with a bold, ~20-word headline, may include one runnable code block (25 lines max),
  and may end with two short follow-up lines.
- **Answering completed turns:** STT → existing final persistence/broadcast → identity
  resolution → `turns/turn-assembler` → prefilter (`triggers.ts`, loose, local) → classifier →
  freshness/cooldown → suggestion runner. Interims and VAD count only as activity, never text.
  A turn closes after a boundary plus a 350 ms continuation grace, after 1,800 ms with no
  advancing speech, or on a confirmed speaker change in final text; channels are independent.
- **Classifier** (`assistant/classifier.ts`): one non-streaming call with `classifierModel`
  (default Haiku), 64 tokens, 2.5 s hard deadline, answering one of `question | request |
objection | none`. It **fails closed**: timeout, cancel, malformed output or provider error
  means no automatic answer. Provider failures suspend classification for 30 s (rate-limited
  log without transcript text, no overlay error).
- **Admission:** one classifier at a time, one newest replacement candidate, ≥1 s between
  starts; a candidate lives 6 s from completion (checked before classifying and before
  generating); the answer cooldown (`nudgeCooldownSec`, 0–60, default 5) is read before
  classification and again before generation, and consumed only when an answer starts. A
  pending candidate is dropped when new finalized speech follows it (the speaker resumes,
  someone else takes over, or the user answers with a final of 3+ words).
- **Next point coaching** (opt-in `coachWhileTalking`; `coach-policy.ts`, `coach-prompts.ts`):
  an episode is consecutive confirmed-user speech, ended by another speaker, unknown identity
  or 8 s of silence. Long rule: ≥20 s finalized speech and ≥40 words. Pause rule: ≥8 s and ≥20
  words, latest user turn completed, 1,800 ms without advancing speech. Attempts are 30 s apart
  (failures included) with ≥20 new words or ≥8 s new speech. It uses `nudgeModel`, 220 tokens,
  8 s deadline, no retries, and returns NONE when nothing is grounded. Delivery is buffered:
  nothing is published unless complete and accepted. It never runs while a hotkey answer runs,
  a candidate is pending or the ambient lane is busy; a new candidate, "Answer now", another
  speaker's final or stereo ch1 activity cancels an unpublished one (ambiguous mono activity
  blocks only the pause path). The advisory capture warning does not suppress coaching. Extra
  cost is about $0.11/hour (uncached).
- **Lanes:** ambient (automatic answers and next points, `trigger='ambient'`) and hotkey. A next
  point is `trigger='ambient'` with `purpose='next-point'`. While the ambient lane is busy only
  the newest classified candidate waits.
- **Transient state and the epoch:** assembler, candidates, timers and coaching state are
  in-memory in `meetings/assist/live-assistance.ts`. Pause/stop invalidate assistance BEFORE
  awaiting socket shutdown; reconnect resets and pin changes discard the unfinished turn and all
  pending automatic work (epoch). An answer already streaming still finishes and persists after
  Stop. Receipt time (`performance.now`) drives grace/cooldowns; provider audio time orders
  speech; stored suggestion times still use `audioMsReceived`.
- **Capture health** (`meetings/capture/capture-health.ts`): in This-PC stereo meetings it
  inspects the PCM `sendAudioChunk` accepts, before STT and the WAV. ~5 s of continuous
  exact-zero channel 1 while the mic peaked ≥300 for ≥1 s sets `MeetingState.captureWarning`
  (Live page and overlay); ≥1 s of nonzero ch1 clears it. Advisory only: it never relabels,
  drops data or stops the meeting.
- `pinSpeaker` throws for stereo meetings (identity is by channel); on mono it relabels the
  in-memory prompt window and invalidates pending assistance.
- **On-demand trigger:** global hotkey → immediate full answer, regardless of whisper mode.
  It has its own in-flight lane, so it can stream alongside one ambient answer; each suggestion
  is independently timed out and balanced in the post-processing guard.
- **Overlay history:** suggestion events are reduced by ID into an in-memory list for the
  current meeting. Ambient arrivals preserve an answer being read and advertise the newer
  item; explicitly requested answers are always selected (selection only — never the
  workspace or keyboard focus).
- **Whisper mode:** Smart (default) answers concrete asks such as code, commands, numbers,
  definitions and formulas while coaching other moments; Full answers every ambient moment;
  Points keeps ambient help terse. Points/Smart use tight budgets; Full/on-demand have room
  for the optional code block. Both ambient and on-demand output are logged.

### Storage

- **SQLite** via `better-sqlite3` in the main process (`%APPDATA%/sanas/sanas.db`).
- Audio files under `%APPDATA%/sanas/audio/` (`meeting-<id>.wav`).
- **Retention** (`services/retention/`): two age limits in Settings — recordings (default
  90 days) and whole meetings (default keep forever). A timer in main runs the purge 30 s
  after launch and every 6 h; Settings shows what is past its limit and can run it now.
  Live meetings are never touched. Deleting a meeting by hand goes through the same
  `removeMeeting` (file + row).
- Schema (current v7: v1 base, v2 `speakers`, v3 `jobs.summary_email`, v4 `segments_fts`, v5 `suggestions.purpose`, v6 presentation, v7 live context/grounding; later tables described below):

```
jobs        (id, name, company_info, project_scope, notes,
             talking_points, persona, created_at, archived,
             summary_email)                 -- per-job recipient (v3)
glossary    (id, job_id, term, note)
meetings    (id, job_id, title, started_at, ended_at,
             audio_path, summary, action_items)
segments    (id, meeting_id, t_start_ms, t_end_ms, speaker,
             is_user, text)              -- final transcript segments
suggestions (id, meeting_id, t_ms, trigger,     -- lane: 'ambient' | 'hotkey'
             prompt_window, text,
             purpose)                        -- 'answer' | 'next-point', default 'answer' (v5)
speakers    (meeting_id, speaker, name)         -- user-assigned names (v2)
segments_fts  FTS5 over segments.text (v4)      -- external-content index, porter stemming;
                                                   -- insert/delete/update triggers keep it current
```

### Process/IPC boundaries

- **Main process:** SQLite, filesystem, Deepgram WS client, Claude client, global
  hotkeys, window management, API keys (from local config, never in renderer).
- **Renderer(s):** UI + mic capture only. Audio chunks stream to main over IPC;
  transcript/suggestion events stream back. `contextIsolation` on, no node in renderer.

### External interfaces

| Service       | Purpose                | Data sent                                                  |
| ------------- | ---------------------- | ---------------------------------------------------------- |
| Deepgram WS   | streaming STT          | live audio, glossary terms                                 |
| Anthropic API | suggestions, summaries | transcript excerpts, job context pack                      |
| SMTP (user's) | summary email          | summary + action items (no transcript)                     |
| Anthropic API | ask-your-history       | the question + retrieved transcript excerpts (≤ 12k chars) |

Keys and the SMTP password stored locally in the app config. The summary email goes only
to the address set on the meeting's job; nothing else leaves the machine.

## Search and Ask

- **Search** (Search page): `ftsAllOf(query)` — every word quoted, the last as a prefix —
  against `segments_fts`, ranked by bm25, snippets with the matched terms marked. Stemmed,
  so "deciding" finds "decided".
- **Ask** (`services/history/`): the question becomes `ftsAnyOf` (stopwords dropped, terms
  OR-ed, bm25 ranks by how many match); the top hits are expanded to their ±2 neighbouring
  segments, grouped per meeting (≤ 8 meetings, ≤ 12k chars) and sent to Claude with a
  grounding system prompt that demands citations as [title, date] and an explicit "not in the
  excerpts" when the answer is missing. Sources return to the renderer at once; the answer
  streams as `HistoryEvent`s over the same broadcast path the live suggestions use.

## Meeting lifecycle

`idle → live → (paused ⇄ live)* → idle`. Start creates the row, opens the STT connection and
begins recording; pause closes the connection and stops audio while keeping everything else;
resume reopens with the meeting's clock carried over; stop ends the row and kicks off the
post-meeting passes below. Only one meeting is live at a time; the orchestrator
(`services/meetings/index.ts`) runs it and publishes which one it is through
`services/meetings/status/live-meeting.ts`, so delete can refuse the meeting still being written to.
At main-process startup, before IPC can start another meeting, rows left open by an earlier
process are closed at their last persisted segment end (or at their start if empty).

## Post-meeting

On meeting end, two fire-and-forget passes:

1. **Summary** — one Claude call generates a durable, sectioned Markdown knowledge extract plus
   action items; stored on the meeting row. Its output ceiling scales with transcript length, so a
   short meeting stays short while a long technical meeting can retain decisions, learned facts,
   exact technical specifics, uncertainties, and people/roles.
   Then `MeetingUpdated` is broadcast and, if auto-email is on, the summary is emailed.
   The meeting view can also re-run it on demand from the stored transcript — capped at
   ~120k characters by `SUMMARY_CHARS` in `assistant/prompts.ts` (`summarizeStoredMeeting`),
   rebuilding the job context prompt from the DB.
2. **Re-diarization** — the recorded WAV goes through Deepgram's batch API
   (`SttProvider.transcribeFile`); batch diarization sees the whole file, so speaker
   labels are stable. Live segments are replaced wholesale (streaming labels drift).
   Batch re-numbers the voices, so "that's me" pins (mono) and speaker names are carried
   over by time overlap (`meetings/rediarize/speaker-carryover.ts`); names/merges stay user-editable
   per meeting in the transcript view.

## Presentation mode

Schema v6 adds ordered job_slides, immutable meeting_slides, and meeting_slide_events (meeting/revision, ordinal, audio time). Meeting creation copies the deck and records revision one in one transaction. Foreign keys cascade deletion; re-diarization only replaces segments.

Typed presentation IPC validates deck replacement and expected meeting/direction. Main serializes navigation with lifecycle operations, persists the audio-clock event before changing the cursor, then resets only coaching and broadcasts. Boundaries do nothing; paused moves retain the audio timestamp and increase revision.

Answers cache the complete snapshot deck with job notes/glossary. The current title is a short user-message hint. Classification and answer streams survive moves. Coaching has a separate stable context without the full deck; its user content contains the complete current slide, title/talking point of the next slide, current-visit finalized Me evidence and coach headlines only. Moves cancel buffered coaching and reset eligibility; delayed/crossing finals do not count for the new visit.

Historical transcript views, exports and summaries combine immutable events with segments by audio time, markers first at ties. Summary excerpts retain the active marker and never treat prepared scripts as speech. Regeneration reads the recorded snapshot, not the edited job deck.

## Live context and manual assistance (v7)

Deck versions are immutable; the active version can change. Context revisions increment on text/deck Apply, deck versions only on content changes, and presentation revisions on navigation/replacement/clear. Revision zero records the meeting-start deck and empty text, including ordinary meetings. v7 copies v6 events and slides into version zero before dropping old tables, with foreign keys enabled.

Apply validates expected context/navigation revisions in the lifecycle queue, then commits context, optional deck and navigation event in one transaction. In-memory prompts, cursor and broadcasts follow commit. Identical content is a no-op. Job notes and decks are never written by meeting controls. Clear records a null ordinal; history resolves markers by version and ordinal, with markers first and revisions ordered at equal audio times.

At meeting start both ordinary and presentation job/persona/glossary bases are captured. Answers use the selected base plus the complete effective deck as a separate cacheable provider block. Meeting text and the current-location hint stay in user content. Coaching has no full-deck block and accepts only its original context/presentation revisions. Edits reset coaching evidence; classifiers and started answers survive.

Typed, detail and audience requests reuse the requested lane while live or paused. Admission snapshots grounding and returns before generation completes. Detail loads the persisted source ID, original system/deck context and prompt window; current speech/edits never replace that grounding. Successful completion events retain their transient reducer ID and add the stored SQLite ID. Linked detail cards do not overwrite sources.

Saved context is owner background in summaries and exports, never transcript evidence or FTS content. Summary regeneration still rebuilds job context from current job data; only detail guarantees replay of the original job prompt. Contextual/presentation merges are refused even after clearing content. Ordinary merges reassign/deduplicate grounding before deleting source meetings.

### Screen capture (no persistence)

Capture screen (IPC or the global shortcut) and Attach screen enter `meetings/assist/capture-requests.ts`.
It checks the live meeting, the requested lane, the API key and a single "preparing" flag, then
captures OUTSIDE the lifecycle queue (`services/screen-capture/`: display under the overlay →
`desktopCapturer` source by `display_id` → bounded PNG/JPEG + thumbnail, 5 s deadline) so Pause and
Stop never wait. The result re-enters the queue and is admitted against the same meeting through
`admitManual` as a `capture` request: `AssistRequest.image` carries the base64 image, which
`claude.ts` alone maps to an image block before the text, with retries off. Cached system/deck
blocks and `prompt_window` never contain it. Attach screen instead stores one main-memory draft per
meeting and returns only a bounded thumbnail data URL and a UUID token; a typed request naming the
token sends that exact image and consumes the draft on acceptance. Drafts drop on meeting start/stop
and renderer destruction. Status (`capturing`/`analyzing`/`failed`) is broadcast and also fetched on
overlay mount. Screen answers persist as typed answers with a request-text marker (no schema change).

## Release and update boundary

Only packaged normal startup initializes electron-updater after database initialization. Main talks
to GitHub for release metadata and installer downloads; renderer receives sanitized typed snapshots
and parameterless get/check/restart operations. No meeting data or API keys enter this traffic.
The snapshot revision prevents stale initial replies replacing newer events. Settings update state
is separate from persisted settings. Main rechecks restart eligibility on every click.

The entry point configures userData before readiness and dynamically loads normal startup or smoke.
Database initialization keeps its candidate connection private while awaiting a consistent backup
for an existing older schema; windows, IPC and services start only after successful migration.
Final shutdown closes the connection. Smoke never imports normal startup and uses disposable data.
