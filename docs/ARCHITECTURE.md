# Sanas — Architecture

_How the system works. For code shape, see [../STRUCTURE.md](../STRUCTURE.md)._

## Overview

Latency round 3 extends the existing assistance/run observers, without a database change:
run records now include a tracker `sessionId`, meeting/run/stored suggestion IDs, effective
profile/model/token budget/effort (custom model IDs become `custom`), classifier start/end
offsets, SDK request dispatch, first protocol event, first text, fetch attempt/retry counts,
promotion and readable broadcast. Terminal outcomes and discard reasons stay separate.
`providerPolicy` records the actual wire effort (including omitted) and thinking mode;
the profile's requested effort is kept separately. Records also carry cumulative overflow
and explicit linked/missing/not-applicable run correlation.
`candidateTerminal` identifies the final candidate outcome; open dependent runs retain its
identity even when a fallback settles first. Request mismatch evidence lists only bounded
categories (`user-content`, `grounding-context`, `model-profile`, `carried-turns`, `image`,
`other`); user content combines transcript, told stories and meeting context.

The overlay acknowledges readable committed content through typed `SuggestionVisibility`
IPC. Main stamps receipt and checks window visibility. The same tracker emits bounded
`visibility` records keyed by session/meeting/run, including hidden/unselected states;
these are not answer runs. Visible rAF receipt duration is relative to readable broadcast.
No renderer clock is subtracted from main's clock. Acoustic clock calibration is still
unavailable; the raw audio cursor gap remains a proxy, not calibrated speech-end latency.

The **Mock interview** tab starts a practice meeting for a chosen job using the normal
settings, userData, recording and STT lifecycle. The shared renderer Start helper opens This PC
mic + loopback before typed mock IPC calls the existing serialized meeting service. Stereo is
required; missing Claude/Deepgram keys link to Settings. Live and Mock pages stay mounted across
tab navigation so capture survives. Losing the library renderer, closing the interviewer,
End, normal Stop/Pause, output failure or the plan duration ends the mock and meeting.

`services/mock-interview/` owns the single guided engine, built-in job/client plans and packaged
fixtures. `turns/` owns engine/interviewer/session composition; pure `validatePlan` validates
bundled JSON at catalog load, with screen IDs resolved to packaged assets at display time.
A separate interviewer BrowserWindow shows persona, captions, speaking/listening/thinking
status, shares and controls. Local-only speechSynthesis plays through default output, acknowledged
by that window with a bounded deadline; no PowerShell child. The window receives only mock state,
never transcript/suggestion broadcasts. The interviewer AssistantProvider consumer receives an
explicit projection of plan + finalized conversation, never Sanas answers. Silence only counts after the candidate (user role) has spoken (`turns/answer-wait.ts`): 4 s then advances; one 30 s idle prompt if they never start. VAD alone extends but never starts an answer; calls have deadlines, bounded follow-ups and planned-question fallback.

Optional main-only meeting/run/assistance subscriptions collect outcome evidence without changing
admission policy. Shared pure outcome code correlates automatic requests by recognized audio spans.
Results store question, delivery, first-visible/completion latency, prose word count and reasons;
first-visible is the main broadcast proxy, not compositor paint. Manual screen requests have no
automatic question span and are not guessed into these metrics. Late answers update saved results
for up to 65 seconds after End, including when another session starts. Summaries/batch processing
continue through the normal meeting lifecycle.

Schema v8 adds `meetings.practice` (default false) and cascading `mock_results`. Practice records
remain complete, labelled and accessible from the tab's past sessions, but normal job history,
Search and Ask retrieval exclude them. Practice merges and automatic summary email are disabled.
Explicit per-session summary/export/email still work. Storage retention/recovery include practice
because they manage files and rows, not cross-meeting knowledge.

Rehearsal diagnostics use an optional, explicit-mode main-process observer at the assistance
coordinator. It observes completed turns, classifier outcomes and suppression/invalidation
reasons without changing decisions or timers. Local request metadata links focused turn spans
or asynchronous manual action IDs to suggestion events; the Claude transport never sends that
metadata externally. Rehearsal reports retain IDs, timings, verdicts, word counts and image
digests, not prompt text or image bytes. The observer is absent in ordinary startup and cannot
throw into assistance. See [REHEARSAL.md](REHEARSAL.md) for acceptance and retained artifacts.

Electron desktop app, single-device, local-first. Three window roles:

1. **Main window** — library UI: jobs, meetings, transcripts, context packs, settings. Native title bar hidden; the app header is the title bar (titleBarOverlay, `main/windows/window-chrome.ts`).
2. **Overlay window** — small frameless always-on-top panel shown during a live meeting;
   answer-first: the selected suggestion, plus one secondary workspace (Ask, Screen,
   Transcript, Context) chosen from a rail. Summoned/dismissed by global hotkey.

3. **Interviewer window** — separate normal window for mock sessions; full-window shared fixture above captions and controls.

### Overlay composition

`overlay-app/shell/OverlaySession.tsx` composes every controller once for the window's
lifetime — transcript/meeting state, settings, ghost/shortcut labels,
navigation, suggestion history, manual requests, the composer (draft + screen attachment),
capture status and Answer every question — and hands view models to `OverlayShell`. Views
own no subscriptions or request policy. All workspaces stay mounted (hidden ones are `inert`),
so switching never resets a draft, attachment, history selection or scroll position; a new
meeting does. The compose listener and `composerReady` handshake live in the session, above
conditional rendering: a cold-start Ask intent opens Ask and focuses the textarea once it is
available. Navigation is a pure reducer (`shell/navigation/overlay-navigation.ts`) whose only
inputs are the owner's actions and a meeting change — no answer or context event can
switch the workspace, and every meeting opens on Answer. Local shortcuts (Ctrl+1–3, 5, 6; Ctrl+4 unbound; Ctrl+,
and Escape) are a window keydown listener; global shortcuts stay in main. In a secondary
workspace the answer is a preview above a draggable divider whose ratio persists as
`overlayWhisperRatio`; Answer gives it the whole column.

**Main-window reveal.** The overlay's Open Sanas invokes the parameterless typed channel
`MainWindowShow` (`app.showMain()` in preload; handler in `ipc/windows.ts`), which calls the
same `createMainWindow()` entry point startup and second-instance use: an existing window is
restored if minimized, shown and focused — never reloaded or routed, so the Live page and its
microphone session keep running. The overlay's Context and the Live page edit the same saved
meeting-context text.

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
  `stt/deepgram/deepgram-events.ts` normalizes messages into finals plus `SttSignal`s (boundary:
  endpoint | utterance-end; activity; reset) via the optional `onSignal` callback. A stereo
  message with a missing or invalid channel index becomes channel -1 (identity unknown), never
  implicitly "Me". An unexpected socket close emits `reset` at once, before the backoff.
- **Session and clock:** `stt/deepgram/deepgram-session.ts` (`DeepgramSession`) owns the socket lifecycle;
  `deepgram.ts` (same folder) keeps the provider and batch transcription; `deepgram-stream-url.ts` builds the URL.
  Every PCM byte handed to `sendAudio` is counted (including chunks dropped in reconnect backoff)
  from `startOffsetMs`; each socket's offset is frozen where its first transmitted chunk started and
  applied to finals, interims, endpoint, utterance-end and VAD, so timestamps stay on the meeting
  audio clock (= the WAV) across reconnects. `deepgram-watchdog.ts` (`ResultWatchdog`): armed by the
  first transmitted chunk; any Results message (even empty) refreshes it; stall = audio sent in the
  last 2 s and 9 s without Results. A stall retires the socket, emits one reset, closes it (4000
  `stalled`) and runs the bounded backoff (1, 2, 4, 8, 8 s), then reports "connection lost
  (stalled)". Opening is bounded at 10 s; Stop never resurrects a socket. No audio is replayed.
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
- **Answer prompt context** (`assistant/answer-context/`, `conversation-window.ts`): answers
  carry the question they answer and two labelled transcript sections: "Earlier conversation
  (background only ...)" (<= 2,500 chars, `BACKGROUND_CHARS`) and "Current exchange" (from the
  question's first word, `TriggeringTurn.startMs`, to now; <= 4,000 chars, opening and newest
  text kept), split by line audio time (`tStartMs >= startMs - 250 ms`). Automatic answers use
  the classified turn; Answer now / the hotkey use `turns/latest-question.ts`: the latest
  other-speaker turn of >= 3 words (an open turn from `TurnAssembler.openTurns()` wins and is
  marked "may be cut off"), else the last completed one within 90 s (`ANSWER_NOW_QUESTION_MS`);
  with none it falls back to the old rolling 6,000-char window. The system prompt's
  `CURRENT_QUESTION_RULE` (`answer-context/anchor.ts`) makes earlier turns/answers background.
  `told-stories.ts` keeps the last 6 answers (headline + first prose line; automatic, Answer
  now, More detail, typed; not next points, audience or capture) per meeting, held with the
  other shown-suggestion memories by `ShownLedger` in `LiveSession`; automatic and Answer now
  prompts show them as "do not re-tell" (the block also carries the pick-an-untold-resume-role
  rule), and only automatic answers may still decline with
  `<none>`. Next points use the same background/question/explanation shape and keep the
  3-headline list.
- **Answering completed turns:** STT → existing final persistence/broadcast → identity
  resolution → `turns/turn-assembler` → prefilter (`triggers.ts`, loose, local) → classifier →
  freshness/cooldown → suggestion runner. Interims and VAD count only as activity, never text.
  A turn closes after a boundary plus a 150 ms continuation grace (350 ms before 2026-11-04),
  after 1,800 ms with no advancing speech, or on a confirmed speaker change in final text;
  channels are independent.
- **Latency paths (speech end → first readable answer):** a turn closes by endpoint
  (`endpointing=600`) + 150 ms grace; by UtteranceEnd (`utterance_end_ms=1000`, ≈1.15 s path); or by
  the 1,800 ms fallback after the last ADVANCING receipt (not acoustic speech end). Then
  max(classifier complete, answer first text) + IPC/paint; the classifier and answer overlap through
  speculation (next bullet). Warm 2026-11-04 medians (Haiku 697 ms, Sonnet first token 1,182 ms)
  give a nominal ≈1.9 s on the endpoint path, but owner measurements are slower: treat it as
  nominal; the stage timing evidence below is how to find where the time goes.
- **Speculative answer** (`assist/speculative-answer.ts`, `SuggestionRunner.speculate`): when the
  classifier starts on a free ambient lane, the answer is built with the neutral automatic
  focus block (`answer-context/automatic-turn.ts`: one wording for all six accepted verdicts, never
  stating kind or addressee) and starts with it, **unpublished**: it owns the ambient lane and the meeting hold, but emits no event and
  stores nothing; deltas are buffered. On the verdict, the ordinary request is rebuilt from the
  state at that moment with the same builder; the speculation is **promoted** (held text shown at once, then it streams
  and persists like any answer) only if that request is the identical prompt (same
  window, told stories, grounding, carried questions, model). Otherwise it is
  **discarded** silently and the ordinary request starts: `none`, failures, `other` under Answer
  every question (explicit reference-answer prompt), a moved-on window, a changed ledger, expiry, a dropped candidate, Stop/reconnect/pin
  change, its own provider failure or timeout. Cooldown and ledger coverage are consumed only on
  promotion. "Answer now" uses the hotkey lane and never touches it. Every speculation is a paid
  call, discarded or not: `speculation-started/promoted/discarded` diagnostics and a
  `speculative answers: started=… promoted=… discarded=…` log line at Stop count it.
- **Stage timing evidence** (`assist/diagnostics.ts`, `run-observation.ts`, `assist/latency.ts`, `assist/latency-summary.ts`):
  assistance events `turn-completed`, `classifier-started`, `classified`, `answer-started` (with the
  `suggestionId`, correlating candidate turn and run) and the speculation events; run events
  `begin`, `first-text`, `first-readable`, `promoted`, `visible`, `usage`, `settled`, each stamped
  `at` (monotonic) with `trigger`. `LatencyTracker` correlates them by candidate (completed turn id),
  classifier attempt and run (a fallback run links to its discarded speculation) into allowlisted
  records: ids, enums, canonical verdict or failure category, malformed shape, completion reason,
  turn-assembly timing, durations (classifierMs, closeToRequestMs, requestToFirstTextMs,
  closeToFirstTextMs, closeToPromotionMs, closeToFirstReadableMs, requestToFirstReadableMs,
  lastFinalToFirstReadableMs), discard category, outcome, usage. Never text, prompts, names, raw
  provider output or error bodies. Bounded: 64 open candidates/runs, 200 finished records, an
  overflow counter, nothing per delta. "First readable" = first broadcast whose visible text has a
  letter or digit (a proxy for visibility, not renderer paint). Manual and next-point runs are
  classified `n/a`. `live-session.ts` logs one `[sanas] latency {json}` line per finished record;
  `summarizeLatency()` (latency-summary.ts) gives counts and medians per "verdict · path", speculation
  started/promoted/discarded with reasons, fallbacks, outcomes and missing/partial usage.
  Rehearsal reports and Mock feed the same tracker (docs/REHEARSAL.md).
- **Turn-close measurement:** `TurnFinal` carries optional `ingressAt` (monotonic, stamped in
  `meetings/index.ts` before the synchronous insert) and `audioCursorMs`; `TurnAssembler` attaches
  `CompletedTurn.assembly` (ingress→assembly, last-final→close, boundary→close, timer lateness,
  boundary source, capped accepted/rejected/cancelled counters, audio-cursor gap as a PROXY on the
  audio clock). Measurement only; no timing policy changed.
- **Provider usage:** `AssistRequest.onUsage` (optional, best effort, once per call) reports
  `ProviderUsage` {inputCount, outputCount, cacheReadCount, cacheWriteCount, partial}
  (`assistant/claude-usage.ts` extracts, `provider-usage.ts` reports best effort; `claude.ts` reports final usage, or partial from the stream
  snapshot on failure/cancel). Missing fields are unknown, never zero; total input =
  input + cacheRead + cacheWrite. No token-count API calls.
- **Clocks:** durations use the monotonic receipt clock; audio-clock values (STT/WAV time,
  `audioCursorMs`) are never mixed with them.
- **Classifier** (`assistant/classifier.ts`): one non-streaming call with `classifierModel`
  (default Haiku), 64 tokens, 2.5 s hard deadline, answering one of `question | request |
objection` + `me | room | other`, or `none`. Parsing (`classifier-verdict.ts`) is tolerant but
  conservative: one kind and one addressee as whole words in either order and any case or
  punctuation, else fail closed (competing, hedged, incomplete or over-long replies); evidence keeps
  the canonical verdict or a content-free malformed shape, never the reply. It **fails closed**:
  timeout, cancel, unaccepted output or provider error means no automatic answer. A single provider failure or timeout skips only its turn; 3 consecutive ones suspend classification for 30 s (rate-limited
  sanitized diagnostics without transcript text, with library/overlay availability status).
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
- **Retention** (`services/platform/retention/`): two age limits in Settings — recordings (default
  90 days) and whole meetings (default keep forever). A timer in main runs the purge 30 s
  after launch and every 6 h; Settings shows what is past its limit and can run it now.
  Live meetings are never touched. Deleting a meeting by hand goes through the same
  `removeMeeting` (file + row).
- Schema (current v13: v1 base, v2 `speakers`, v3 `jobs.summary_email`, v4 `segments_fts`, v5 `suggestions.purpose`, v6 presentation, v7 live context/grounding, v8 practice/results, v9 `meetings.resume_name`/`resume_text` with an immutability trigger, v10 immutable meetings.interview_profile, v11 `job_resumes`, v12 snapshot-clear guard, v13 `job_applications` + `jobs_delete_guard`; later tables described below):

```
jobs        (id, name, company_info, project_scope, notes,
             talking_points, persona, created_at, archived,
             summary_email)                 -- per-job recipient (v3)
glossary    (id, job_id, term, note)
job_resumes (job_id PK, name, text)          -- saved job resume, copied at Start (v11)
job_applications (job_id PK, application_id UNIQUE, source_root,
             content_hash, fingerprint, source_stage,
             source_updated_at, imported_at, baseline)  -- link to a resumes pack (v13)
meetings    (id, job_id, title, started_at, ended_at,
             audio_path, summary, action_items, practice)
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

## Meeting context and manual assistance

**Start.** The Live page sends `meeting.start(jobId, channels, { interview?, meetingContext? })`
(`shared/meeting-start.ts`), validated at ingress by `requireMeetingStart` (`ipc/validate.ts`:
unknown keys refused, context a string of at most 20,000 characters, never truncated). Main
composes it with main-only `practice` into `StartRequest`; `createMeeting` writes the meeting row,
its version-0 `meeting_deck_versions` bookkeeping row and context revision 0 (the exact Start
text, possibly empty, at t=0) in one transaction, before `LiveSession.begin` and before STT opens.
Mock calls `startMeeting(id, 2, { practice: true })` and gets empty context.

**Apply.** Context is append-only text revisions (`meeting_context_revisions`). Apply validates
the expected revision in the lifecycle queue, persists, then updates in-memory prompts and
broadcasts (`context/session.ts`: prepare → persist → publish); identical text is a no-op and a
failed save changes nothing. New revisions repeat the latest row's `deck_version` (0 for every
post-retirement meeting). A payload still carrying a `deck` is refused.

**Prompts.** `MeetingPrompts` freezes one system prompt per meeting at Start (persona, job
context including talking points, glossary, candidate facts) and saves its grounding row once
(version 0, empty deck context). Meeting text rides in user content as a delimited
`<meeting-context>` block on answers, typed, capture and audience requests and on the ordinary
Next point coach. A context Apply cancels a buffered next point, resets coaching
(`LiveAssistance.contextChanged`) and stamps later requests with the new revision; classifiers
and started answers keep the context they captured, and a coach result is accepted only if the
revision is unchanged.

Typed, detail and audience requests reuse the requested lane while live or paused. Admission snapshots grounding and returns before generation completes. Detail loads the persisted source ID, original system/deck context and prompt window; current speech/edits never replace that grounding (legacy answers recorded with a deck replay their stored deck block). Successful completion events retain their transient reducer ID and add the stored SQLite ID. Linked detail cards do not overwrite sources.

Saved context is owner background in summaries and exports, never transcript evidence or FTS content. Summary regeneration still rebuilds job context from current job data; only detail guarantees replay of the original job prompt.

**Merge.** `merge-plan.ts` refuses legacy slide meetings and more than one part with context
(`hasMeetingContext`: nonempty initial text or any revision > 0). Each step carries a context
action: `move` (this later part's revisions are copied onto the kept meeting at revision + 1 and
t + offset, and its suggestions' `context_revision` shifts by 1), `unlink` (the kept meeting has
the context; this part's suggestions get a null revision) or `keep`. Ordinary merges
reassign/deduplicate grounding before deleting source meetings.

**Historical presentation records.** Presentation mode was retired on 2026-11-04. The v6/v7
tables (`job_slides`, `meeting_slides`, `meeting_slide_events`, deck versions) remain and are
never written, except the version-0 deck row every meeting needs for foreign keys.
`db/repos/meeting/meeting-presentation.ts` reads them (`getPresentationHistory`,
`hasLegacySlides`); `ipc/presentation-history.ts` serves the read-only history; MeetingView,
exports (`meetings/export.ts`) and regenerated summaries (`meetings/presentation/history.ts`)
interleave markers with segments by audio time, markers first at ties, never as speech.

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

## Isolated rehearsal flow

Explicit `--rehearsal` dispatch bypasses normal startup and creates a unique worktree-local
userData before opening settings/SQLite. The runner installs providers and DesktopDeps before
importing the meeting orchestrator. Scripted interims/finals/boundaries feed its real callbacks;
audio replay feeds `sendAudioChunk` at 20 ms intervals. The real lifecycle owns turn assembly,
coach/answer admission, persistence, broadcasts, recording, summaries and batch replacement.
Only optional Visible/real-capture mode creates the production overlay and registers IPC.
No normal retention/updater/email/hotkey startup runs. Main-only observation collects final,
suggestion and health evidence; live storage is checked before batch replacement. Screen checks
match encoded bytes at acquisition and assistant receipt. The report contains expectation IDs
and outcomes, not transcript or credentials. See [REHEARSAL.md](REHEARSAL.md).

History filing goes through meetings/status/filing.ts, which rejects the current live or paused meeting without rebinding context.

## Resumes: saved on the job (v11), snapshotted on the meeting (v9)

The job owns the editable resume: `job_resumes` (v11, one optional row per job, cascades with
the job) via `db/repos/job/job-resume.ts`. The Jobs page's Resume tab (`app/jobs/JobResume.tsx`)
reads and writes it through `jobs.getResume(jobId)` / `jobs.setResume(jobId, resume | null)`
(`ipc/job-resume/`, validated by `validateResume`, returns the normalized stored value) and
imports drafts through `jobs.importResume()`. The full text never rides on `jobs.list()` or any
meeting/status broadcast; Live only asks `getResume` for availability (Interview default).

Start carries no resume. `meeting.start(jobId, channels, { interview?, meetingContext? })` and
`mockInterview.start(plan, jobId, channels)` both reach `startMeeting`, which, inside the
serialized Start and with no await before `createMeeting`, calls
`resolveStartGrounding` (`services/meetings/context/start-grounding.ts`): the selected job's
saved resume (none when no job was chosen, resolved before `ensureDefaultJob()` supplies the
Unsorted bucket) and the Interview profile (`practice || (interview ?? hasSavedResume)`).
Live state exposes a small `noResume` cue for practice sessions with neither resume nor profile.

The meeting snapshot: the service hands `createMeeting` (`db/repos/meeting/meeting-create.ts`) a main-built `MeetingCreateInput`; it stores `resume_name` and `resume_text` in the same transaction as the initial meeting context. The resume and profile snapshots are read back only through `getMeetingGrounding(id)` (`{ resume, interviewProfile, hasBiography }`), never on list rows; STT hints, candidate facts, re-diarize, the merge guard, the `noResume` cue and the prompt block all go through it. The append-only v9 migration uses the existing pre-upgrade SQLite backup flow. A database trigger rejects changes to these fields; job filing leaves them intact. Resume-bearing merges are refused to avoid losing or misattributing candidate facts.

`MeetingPrompts` reads the saved resume at Start, escapes markup and appends a delimited candidate-facts block to the meeting's one system prompt. It is captured in immutable grounding rows for More detail. Summary regeneration includes it as background, never transcript evidence. It is not added to FTS.

Capitalized names, acronyms, mixed-case technology and a small lowercase technology vocabulary become STT hints. Resume terms alternate with job glossary terms, deduplicate case-insensitively and respect conservative count/length/byte limits. Streaming start/resume and batch transcription use `SttProvider`; no new provider or network path exists.

Resume file import: the job Resume tab invokes a parameterless typed IPC picker (`jobs.importResume`). Main reads at most 5 MB plus one sentinel byte, parses PDF/DOCX locally, applies the existing text validation, and returns only the basename and text as an unsaved draft. Cancellation/errors preserve the draft. The source file is never copied into storage; Save resume stores the same name/text shape as pasted text.

## Jobs from resumes interview packs (v13)

The resumes project (`resumesRoot`, default `C:\Users\dirty\projects\resumes`) owns the data and
its producer: `node <root>/_hunt/cli/sanas-packs.js --json` writes one pack per application at
`<root>/job-hunt/sanas/<applicationId>.json` (and removes packs that dropped below interview).
Exit 0 prints a JSON summary; non-zero prints one stderr line, of which Sanas shows a sanitized
first line (max 160 chars) and never stdout. The producer is not built yet; a missing CLI
degrades to "Couldn't refresh from resumes" plus the packs already on disk. Sanas never writes
into the resumes tree.

- **Source edge** (`services/jobs/applications/source/`): settings are re-validated at use time
  (absolute local path, no UNC/device/`..`/control chars, realpath stays local). The runner is
  `execFile`, no shell, 30 s, 256 KiB output, credential-like env stripped, concurrent refreshes of
  one configuration coalesced. Pack files: regular `.json` only, ≤ 2 MiB, ≤ 500 listed (`limited`),
  canonical containment, a file that changes or vanishes mid-read is a retryable row error.
  `validate-pack.ts` enforces schema v1 and limits; the pack fingerprint is a sha256 of normalized
  content excluding `contentHash`/`updatedAt`, so a missing or reused `contentHash` cannot hide a change.
- **Flow** (library window only): `job-applications:list` (run the CLI, then read packs) →
  `:preview` (create form, or three-way refresh review; returns a main-owned token) → `:apply`
  (re-read the pack, re-check everything, one repository transaction). Tokens are single-use,
  10 minutes, bound to the sender window, source config, pack fingerprint and, for refresh, the
  job's saved-state aggregate; any drift answers "Changed since preview—review again."
- **Create** writes the job, glossary, resume and `job_applications` link (with the import
  baseline) in one transaction; `application_id` is unique, so a concurrent second import fails.
- **Refresh** compares base (baseline) / local (saved job) / incoming (pack). The resume is one
  unit and the glossary one collection (local notes count as local changes); conflicts default to
  Keep Sanas; the baseline always advances to incoming after a confirmed review. Stage changes are
  reviewed; `closed` offers "Archive linked job" (never deletes); interview/offer never unarchives;
  a different resumes root is `source-mismatch` and never rebinds; refresh never renames the job.
  Meeting snapshots are untouched.
- **Draft-at-import** (create only): empty judgement fields (talking points, persona, glossary,
  company info) are drafted once through `AssistantProvider` (`answerModel`, main only) from notes,
  project scope and company/role/companyInfo, never the resume. Per-field sources
  ("From resumes" / "Drafted by Sanas") persist in the baseline; a drafted field's baseline value
  is the pack's own empty value, so later refreshes treat the draft as local. Refresh never drafts.

## Job deletion (cascade)

Deleting a job deletes its history (docs/DECISIONS.md). `jobs:delete-preview` (library window
only) counts every table directly (`db/repos/job/job-deletion.ts`; `listMeetings` excludes
practice) and returns a token; it is blocked for Unsorted and while any child meeting is live,
paused or post-processing. `jobs:delete` consumes the token, re-checks the snapshot, takes a
SQLite backup (`backups/before-job-delete-*.db`, abort on failure), removes each meeting through
`services/meetings/remove.ts` (row and WAV), then deletes the job row; glossary, resume, link and
legacy `job_slides` cascade. A failed meeting removal keeps the job and reports what is already
gone. The v13 `jobs_delete_guard` trigger refuses the protected jobs and any job that still has
meetings, so no path can cascade meetings away without deleting their recordings.

## Interview profile lifecycle

Settings owns the editable, local interviewProfile string. Typed Settings IPC validates its
40,000-character limit. Live Start passes an optional Interview choice in its Start options; main resolves it once (explicit false wins over the saved-job-resume default,
practice always wins) before creating the meeting. Work meetings capture an empty
string. Schema v10 inserts the profile snapshot in the same transaction as the resume and
meeting; a trigger prevents updates. Old rows default empty.

MeetingPrompts reads only that saved snapshot, so
context Apply, More detail and summaries cannot see later Settings edits. Resume facts
precede profile facts; the profile block directs story selection and reserves marked filler
for gaps. Both use shared delimiter escaping. Streaming open/resume and batch
re-diarization both read the snapshot through getMeetingGrounding. Both call
meetingKeyterms; SttProvider retains budget enforcement. Meeting rows expose only a boolean
interviewProfileUsed for history. Mock's noResume state field now means neither resume nor
profile is present, including fetched and broadcast state.
