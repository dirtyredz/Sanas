# Sanas — Gotchas

_Non-obvious traps. Read before touching the related area._

The normal main process writes `sanas-main.log` (plus one rotated `.1` file) under Electron's
`app.getPath('logs')`; on Windows this is normally `%APPDATA%\sanas\logs`. Packaged smoke never
starts this logger or writes there.

## Audio

- **Windows mic exclusivity/quality:** some conferencing apps grab the mic with
  echo-cancellation/AGC processing. Sanas usually runs while the meeting is on a
  _different_ device, but if a meeting ever runs on the same laptop, expect the mic to
  be shared — capture still works, but disable Chromium's `echoCancellation`/
  `noiseSuppression` constraints deliberately or Deepgram gets over-processed audio.
- **AudioWorklet, not ScriptProcessor:** ScriptProcessorNode is deprecated and janky;
  use an AudioWorklet for the downsample to 16 kHz mono.
- **Diarization is per-connection:** Deepgram speaker indices (0/1/2…) are stable only
  within one WS session; a reconnect can reshuffle them. Re-pin "that's me" after a
  reconnect, or persist a voice heuristic.
- **Diarization needs warm-up + sentence-length speech.** 1–4 word alternating
  utterances all collapse to speaker 0 — the model needs a few sentences per voice to
  build fingerprints. Short-fragment tests are the worst case; judge diarization on
  real meetings only. Also keep `autoGainControl: false` — AGC pumping erases the
  level/timbre cues separation relies on.

- **THE LOOPBACK ROUTING TRAP (This PC mode).** Electron's display-media loopback captures only
  the console DEFAULT output device. Windows has a separate COMMUNICATIONS default, and call
  apps (Teams/Zoom/etc.) often play to that one (reported case: the Dell monitor over NVIDIA
  HDMI while the console default was Realtek). Then ch1 is exact digital silence, the mic hears
  the call through the speakers, every voice is labelled Me and no automatic answer fires (seen
  in every Constellation meeting on 2026-10-29). An acquired loopback track is not proof of a
  working signal; the capture warning now says so. Fix: make the call app play to the console
  default device (or set both Windows defaults to the same device); use headphones only after
  confirming the call still reaches loopback; or pick Elsewhere and pin your voice for a new
  meeting.
- **A stereo message without a channel index is "unknown", not the user.** Deepgram events with a
  missing or invalid index become channel -1 and never coach or count as "Me".

## Renderer

- **`electron-vite dev --rendererOnly` still launches Electron.** It skips _building_ main and
  preload, then starts the app from `out/` — windows appear and global hotkeys register. For a
  browser-only preview use `npm run dev:web` (plain Vite + the mock bridge).
- **Renderer CSP is `default-src 'self'`.** A CSS `data:` image (the select chevron) needs the
  explicit `img-src 'self' data:` in `index.html`; remote fonts and scripts are blocked by
  design — keep assets local.
- **State classes vs page roots.** `.live` was once both the Live page's root layout and the
  sidebar's "listening" modifier, which stretched the status dot into a full-height bar. Page
  roots are `*-page`; modifiers (`live`, `active`, `me`, `interim`) stay bare and never carry
  layout.

## Electron

- **`better-sqlite3` is a native module** — must be rebuilt for Electron's ABI
  (`electron-rebuild` / electron-builder handles it). Version bumps of Electron require
  a rebuild; CI/packaging must not skip it.
- **API keys never in the renderer.** All Deepgram/Anthropic traffic goes through the
  main process. `contextIsolation: true`, `nodeIntegration: false`, no exceptions.
- **Always-on-top overlays vs fullscreen apps:** `setAlwaysOnTop(true, 'screen-saver')`
  level needed to float above some fullscreen windows on Windows.
- **The overlay is always capture-protected.** On Windows, Electron uses
  `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` for `setContentProtection(true)`. Some capture
  tools and older Windows versions show a black box where the overlay is instead of omitting it.
- **Transparent windows have no native resize affordance.** Electron documents transparent
  windows as non-resizable, so `resizable: true` does not give the frameless overlay a usable
  Windows border. Keep its renderer-owned right/bottom/corner handles wired through validated
  IPC; removing them silently makes the overlay fixed-size again.
- **Saved window bounds outlive monitors.** `overlayBounds` is restored from settings, and a disconnected monitor leaves it fully off-screen (invisible overlay). `windows/overlay-bounds.ts` re-fits it to the connected work areas on create and on `display-removed`/`display-metrics-changed`; the fallback is not persisted until the user moves/resizes. Negative DIP coords are valid for monitors left/above the primary.
- **Global hotkeys collide.** `globalShortcut` registration fails silently if another
  app owns the combo — check the return value and surface a settings warning.

- **`SqliteError: disk I/O error` on dev-watch restart is noise.** electron-vite
  `--watch` kills the old instance while its WAL connection is mid-write as the new
  instance opens the same DB. Only happens at "restart electron app..." moments in dev;
  packaged builds are single-instance and unaffected. Don't chase it.

- **Same-PC meetings: the mic CANNOT hear the other side reliably.** Driver-level AEC
  (Realtek/Windows "enhancements") subtracts what the PC plays from what the mic hears —
  which IS the other participants. Volume doesn't help. Use system-audio loopback
  (pick **This PC** on the Live page); it taps the output signal digitally, pre-speaker.
- **Streaming diarization drifts; batch doesn't.** Live speaker indices are unstable
  (S2 can become S7 mid-meeting) — incremental labeling, no lookahead, conference-
  compressed audio. Don't try to fix it live: the post-meeting batch re-diarization
  pass replaces segments with stable labels. Live view jitter is expected, but no longer purely
  cosmetic: in mono, coaching and the classifier's turn grouping depend on live identity, so a
  drifting label can group or attribute a turn wrongly. Pin your voice early.
- **Re-diarization re-numbers the voices.** Batch indices don't match the live ones, so
  "that's me" pins and speaker names are carried over by time overlap (a voice that keeps
  > 50% of its speaking time on one new index keeps its name/identity). A voice batch
  > splits differently may need re-naming; check the transcript after the meeting ends.
- **"Everyone showed up as Me."** In This-PC (stereo) mode the mic channel is stamped as
  the user by construction — the other side is supposed to arrive on the loopback channel.
  Run that mode for a call held on another laptop or in the room and every voice the mic
  hears becomes "Me", with no diarization index to pin. The meeting source is therefore a
  per-meeting choice on the Live page (default Elsewhere), never a global setting.

## IPC

- **Preload's types do not survive the hop.** Every `ipcMain.handle` argument is `unknown` at
  runtime and goes through `ipc/validate.ts` — ids (`requireId`), speaker indices
  (`requireSpeaker`), booleans (`requireBool`), free text (`requireText` / `boundedText` /
  `optionalText`), the job row (`requireJob`: every field must be a string, so a malformed
  payload can never blank stored context) and the settings patch (`requireSettingsPatch`:
  unknown keys dropped, out-of-range values ignored rather than written). The audio stream
  drops anything that is not an ArrayBuffer. A new channel gets a validator first.
- **A new Settings key must get a checker.** `config/settings-schema.ts` is typed
  `{ [K in keyof Settings]: Check<Settings[K]> }`, so adding a key to `Settings` fails to
  compile until the schema has an entry — a setting can never be one the renderer silently
  cannot save. Overlay bounds saved by the main process itself bypass the schema (trusted path).
  A value the schema drops (out of range, wrong type) is not an error: Save succeeds and the
  field visibly reverts to the stored value, because the page applies the returned view. The
  Settings inputs are constrained (selects, a range slider, the port clamped to 1–65535 as
  you type) so this only happens to a hand-crafted payload.

## Storage

- **Deleting a meeting is two deletes.** The row (segments, suggestions, names cascade) and
  the WAV on disk. `db/repos/meetings.deleteMeeting` is row-only by design — go through
  `services/meetings/remove.ts` (`removeMeeting`) from anywhere outside repos, or the file
  stays behind. Retention and the Delete button both use it. If the WAV is locked by another
  program the row is kept too (a file without a row is an orphan): Delete shows "still in use —
  try again", retention counts it as failed and retries next run.
- **`segments_fts` is external-content: never write to it by hand.** Rows are added and
  removed by the triggers on `segments`, and a cascade delete from `meetings` runs them too
  (foreign_keys is ON), so deleting the meeting row is enough. Rebuilding is
  `INSERT INTO segments_fts(segments_fts) VALUES ('rebuild')` if the index ever drifts.
- **User text never touches the FTS5 grammar.** `db/fts-query.ts` quotes every token; a raw
  `MATCH ?` with user input would throw on an unbalanced quote or a stray `NEAR`. Search
  ANDs with a prefix on the last word; Ask ORs content words with stopwords dropped.
- **Retention compares SQLite datetime text.** `ended_at` is `datetime('now')` (UTC,
  `YYYY-MM-DD HH:MM:SS`); the cutoff is built in the same shape so a plain `<` works. A
  meeting with no `ended_at` (still running, or the app died mid-meeting) is never purged.

## Meetings

- **Startup closes meetings stranded by an earlier process.** Before IPC can start a new
  meeting, main gives every non-live row with no `ended_at` an end based on its last persisted
  segment (`started_at + max(t_end_ms)`), or its start when no segment made it to disk. This
  keeps a crash or dev reload from leaving an un-stoppable row that merge will reject.

- **The meeting clock is audio received, not wall time and not transcript time.**
  `sendAudioChunk` counts the PCM it accepts (`audioMsReceived`), and it accepts a chunk
  only while a session exists. That count is exactly what the WAV holds, so the clock, the
  recording and every timestamp main stamps itself (suggestions, a resumed session's
  `startOffsetMs`) describe the same position in the audio, and a pause does not advance it.
  Do NOT use the provider's last transcript time as the cursor: it only moves on a final
  result, so pausing during silence would rewind the clock and the resumed session would
  overlap what was already stored.
- **Segment timestamps come from the provider, so they are NOT guaranteed to match the WAV.**
  They agree with it in the normal case, but an internal reconnect resumes counting from the
  last final word (`stt/deepgram.ts`), and the audio lost during the backoff is never sent —
  so everything spoken after such a reconnect is stamped EARLIER than its true position in
  the recording, by roughly the length of the gap. Explicit pause/resume does not have this
  problem (main supplies the offset from its own count). Treat live segment times as
  approximate after a network wobble; re-diarization, which reads the WAV, is what restores
  true times, and only when `recordAudio` is on.
- **A lost connection pauses, it does not error.** The Deepgram session retries with backoff
  on its own; only when those are exhausted does it report, and the orchestrator turns that
  into a pause so the meeting row survives. The UI shows the reason and a Resume button.
- **A recording merge could not delete is reported, not swallowed.** `mergeMeetings`
  returns `recordingsLeftBehind` and the job view says so instead of opening the merged
  meeting. Retention collects the file later.
- **An orphan is a recording no meeting POINTS AT — not one whose row is gone.** Merge
  clears the survivor's `audio_path` and deletes the other rows, so a WAV it could not
  unlink is left referenced by nothing while its row may still exist. Matching on row
  existence would miss exactly that case, so `retention.orphans()` diffs the audio folder
  against `meetings.audio_path` (normalised — Windows paths compare case-insensitively).
  Orphans have no age, so they are always due, and `previewRetention` counts them or the
  Clean-up button would sit disabled with files to collect.
- **Merging deletes every part's recording**, the kept one included, and clears the
  meeting's `audio_path`. No single WAV covers a merged span, and re-diarization reads that
  WAV and replaces the WHOLE transcript — so keeping one would let a later pass silently
  reduce a merged meeting back to a single part. Merge also refuses a meeting that is still
  being summarised or re-diarized (`services/meetings/status/post-processing.ts`), since those
  rewrite the row underneath it.
- **Merging renumbers speakers into blocks, on purpose.** Diarized numbers are assigned per
  connection, so part one’s S1 and part two’s S1 are not knowably the same person. Merge gives
  each part its own block and leaves the judgement to the listener, who collapses them with
  “merge into…” in the meeting view. Merging is irreversible — the other rows are deleted once
  their segments, suggestions and names have moved.
- **Resume opens a NEW STT connection**, so diarized speaker indices can be renumbered across
  the pause exactly as they can across an internal reconnect. Post-meeting re-diarization is
  what makes labels stable — and it only runs when `recordAudio` is on, since it needs the WAV.
- **Resume must use the same capture topology.** The WAV header and the provider's channel
  mapping were both fixed when the meeting started, so main refuses a resume whose channel
  count differs (loopback can fail on any attempt, turning This-PC stereo into mono).
- **Meeting lifecycle calls are serialized and sessions are generation-stamped.** Start,
  pause, resume and stop all mutate module state across awaits; without the queue two
  resumes open two sessions, and without the generation a dying session's late transcript
  lands on its successor.
- **Audio captured during the provider's reconnect backoff is not transcribed.** The socket
  is closed, so those chunks reach the WAV but never the provider — a gap in the live
  transcript that post-meeting re-diarization recovers (it reads the WAV) only when
  recording is on. Buffering that audio for replay is docs/BACKLOG.md P2.
- **No audio is accepted before BOTH the STT session and the recording are ready.** The
  session is opened, the WAV is opened, and only then is the session published to
  `sendAudioChunk` — so the provider, the file and the clock all begin on the same chunk.
  Publishing the session first would transcribe and count the audio that arrived while the
  file was still opening, leaving the WAV short of the opening words and a later
  re-diarization free to drop them from the transcript.
- **A recording lost mid-meeting is not re-diarized from.** `lostRecordings` remembers it in
  memory, because the disk that killed the WAV can also fail the write that clears
  `audio_path` — and re-diarization replaces the WHOLE transcript, so a truncated file
  would silently cut the meeting down to the part that reached disk.
- **A recording that will not open does not take the meeting down.** It is opt-in and not
  what the meeting is for, so `startMeeting` stays live and returns the reason in
  `MeetingState.error` — silence there would leave the user believing a WAV exists to
  re-diarize and export from.
- **A file stream fails ASYNCHRONOUSLY, and an unhandled `error` on one kills the main
  process.** `createWriteStream` returns before the file is open, and a disk-full write
  fails long after it was accepted. So `startRecording` awaits the open before it claims
  success, and a later failure drops the recording and calls back instead of throwing:
  the meeting keeps running, `audio_path` is cleared (a half-written WAV must not be taken
  for the meeting's audio), and the file becomes an orphan for retention. Patching the
  header on stop is wrapped too — a meeting must be able to end even if its file cannot.
- **The renderer holds the capture in a local until main confirms the meeting.** If
  `meeting.start` or `meeting.resume` rejects after `startCapture` succeeded, nothing else
  references the mic/worklet — both stop whatever they have not handed to `micRef`.
- **Anything that writes to a meeting in the background must mark it**
  (`services/meetings/status/post-processing.ts`, a COUNT so concurrent writes don't clear each
  other). Four things outlive the call that started them: summarising on stop, summarising
  on demand from the meeting view, re-diarization, and an unfinished suggestion — Claude is
  still streaming when Stop returns, and the answer ends in an insert against that meeting.
  **Merge and delete both refuse a marked meeting**, because otherwise the late write lands
  on a row that has been folded away or deleted (a foreign-key failure, and the work lost).
- **Delete also refuses the meeting main is RUNNING** (`services/meetings/status/live-meeting.ts`).
  Merge gets this for free — `planMerge` rejects a meeting with no `ended_at` — but delete
  needs its own guard, and it cannot import the orchestrator to ask, hence the small module
  whose only writer is the orchestrator.
- **Nor a write inside a TIMER callback.** Same rule, no catch above it either: the
  retention sweep and the overlay bounds save both run from timers and both wrap their
  writes. Retention still throws when the user runs it from Settings, where there is
  someone to tell.
- **A DB write inside a provider callback must not throw.** `handleTranscript` runs on the
  Deepgram socket listener and `onRecordingLost` on the file stream's; an exception escaping
  either ends the main process. Both are wrapped, and the realistic cause is the same one —
  a full disk, which breaks the WAV and the SQLite write together. A line that cannot be
  stored still reaches the screen and the prompt window, and the user is told once.

- **Cancellation epochs: invalidate BEFORE awaiting socket shutdown.** Pause/stop must bump the
  assistance epoch first, or a boundary or final arriving during the shutdown handshake starts
  work for a meeting that is ending. Reconnect resets and pin changes bump it too, discarding the
  unfinished turn and pending automatic work. An answer already streaming still finishes and
  persists after Stop.
- **Two clocks in assistance.** Grace periods and cooldowns use receipt time
  (`performance.now`); ordering of speech uses provider audio time; stored suggestion times use
  `audioMsReceived`. Do not mix them.
- **Channel is not speaker.** In stereo, ch0 = user, ch1 = others, anything else = unknown. In
  mono the user must pin their voice or coaching never starts. Unknown identity never coaches,
  and `pinSpeaker` throws for stereo meetings.

- **Vitest in CI has no Electron binary** (`npm ci --ignore-scripts`): main-process tests must mock any module that imports `electron` (directly or transitively), or they fail on Linux while passing on Windows. Check with `node_modules/electron/path.txt` temporarily renamed.

## Running it

- `npm run dev` needs a real terminal. Driven from a non-interactive shell (an agent, a
  CI step, anything whose stdin is closed) electron-vite starts Electron and then tears it
  down again within seconds, exiting 127 with nothing useful on stdout. Nothing is wrong
  with the app: `npm run build` followed by
  `./node_modules/electron/dist/electron.exe out/main/index.js` launches the same code and
  stays up. Use that when you need the window without a human at the keyboard; you lose
  hot reload and gain a launch that survives.
- **One instance at a time** (`app.requestSingleInstanceLock`). A second launch focuses the
  first and exits, so a leftover process from an earlier attempt looks exactly like a
  crash. Check for a running `electron.exe` before concluding anything.

## APIs

- **Anthropic request options reject unusable values even when they look absent.** In particular,
  passing `timeout: undefined` fails with "timeout must be an integer". The provider seam's
  `requestOptions` includes `timeout` only for a finite positive value and rounds it to an integer;
  summary deadlines must remain integer milliseconds.

- **Deepgram WS idle timeout:** the socket closes after ~10 s without audio. Send
  keepalive messages (or continuous silence frames) during pauses, and implement
  auto-reconnect with transcript continuity.
- **Turn boundaries are acoustic, and messy.** `speech_final` can arrive with empty text,
  duplicates, or late; UtteranceEnd can arrive after speech already resumed. Neither means the
  sentence is finished semantically — hence the 350 ms continuation grace and a boundary older
  than observed speech being rejected.
- **The classifier fails closed.** An Anthropic outage or slow call silences automatic answers
  (and suspends classification for 30 s); "Answer now" still works. Effort is not sent to Haiku,
  so the classifier's "low effort" is a no-op on it.
- **Interim vs final results:** interims mutate/replace; only persist finals or the
  transcript in SQLite will accrete duplicates.
- **Claude prompt growth:** a long meeting's transcript exceeds sensible prompt sizes —
  always window the transcript (recent N tokens) + optionally a rolling summary;
  never send the whole thing per suggestion.
- **The ambient cooldown is a cost and distraction guard.** It was originally fixed at
  20 seconds to avoid a Claude call for every nearby question. It is now a 0–60 second
  Settings value (default 5) and the trigger reads it when each candidate fires. Lowering
  it makes nudges faster but can increase API usage and on-screen churn.
- **Suggestion concurrency has two lanes, not one global lock.** One ambient nudge and one
  requested answer may stream together; each lane still caps itself at one. A requested
  answer must never be dropped just because an ambient nudge owns the provider. Each request
  separately marks/clears post-processing, and the overlay disables “Answer now” only while
  the requested lane is occupied. Smart/Points ambient calls time out after 25 seconds;
  Full ambient and requested answers after 60 seconds.
- **Whisper history follows the latest answer by default.** It stays put only after the owner
  navigates to an older item or scrolls within the current answer, and then shows “New answer”.
  Selecting Latest or navigating forward to the end resumes following. A hotkey/“Answer now”
  request always selects the answer it started.
- **Claude effort is not portable across models.** The provider sends
  `output_config.effort` only to Claude Opus/Sonnet 5.x IDs. Haiku and custom model IDs use
  the base request shape so selecting an unsupported model does not fail on that parameter.
- **Anthropic keys come in two kinds.** A key created inside a Console workspace just
  works. An org-level key (created without picking a workspace) is rejected with
  `400 … not scoped to a workspace` unless every request carries `anthropic-workspace-id`
  — Settings has an optional Workspace ID field for that; the Claude client adds the
  header only when it's set. Prefer workspace-scoped keys; the field is the escape hatch.
- **Gmail SMTP wants an App Password, not the account password** — and App Passwords
  only exist once 2-step verification is on. "Username and Password not accepted" with
  correct credentials almost always means this. Port 465 is implicit TLS (`secure`);
  587 must NOT set `secure` (it upgrades via STARTTLS) — the transport derives it from
  the port, so don't add a separate toggle.
- **On-stop summary vs re-diarization race:** the summary uses the in-memory live
  window; re-diarization rewrites segments concurrently. That's fine — Regenerate reads
  the stored (post-diarization) transcript if the stop-time summary looks off.

## Product/legal

- **Recording consent:** some jurisdictions are two-party consent for recording.
  Transcription-without-audio-retention is lighter but not automatically exempt.
  Sanas records/transcribes only on explicit start; audio saving is a global Settings toggle (on by default).

## Moved from the old backlog

- Mic capture + AudioWorklet downsample to 16 kHz mono linear16 (static worklet file — CSP)
- Main-process log to a file: `electron-vite dev` does not forward the Electron child's
  stdout, so `console.log` from main is invisible outside DevTools
- The on-screen clock keeps counting until main confirms a pause, so it can include the
  WebSocket shutdown handshake after capture already stopped. Stored timestamps and the
  WAV are unaffected — this is display only.
- Visual QA in the real Electron window — the browser preview cannot show the frameless
  overlay at 380×460, transparency, or the Windows title bar

## Overlay shell

- **Overlay controllers live in `OverlaySession`, not in views.** Drafts, the screen attachment,
  history selection and capture status must survive workspace switches, so their hooks are
  composed once above the workspaces; a view that owns a subscription or a draft loses it
  when hidden. Meeting-owned state resets on a meeting change, and async replies (typed send,
  attach, More detail, audience) are dropped when they land after the meeting changed.
- **Hidden workspaces are `inert` + `visibility: hidden`, not unmounted or `display: none`.**
  That keeps drafts and scroll positions and removes them from the tab order. Focus cannot
  land in an inert subtree, so the compose activation waits until Ask is active before
  focusing the textarea.
- **`scrollbar-color`/`scrollbar-width` disable `::-webkit-scrollbar` styling in current
  Chromium** (and bring back arrow buttons). The overlay layer uses only the webkit pseudos.
- **`overlayWhisperRatio` now means the answer preview's share above the divider.** The name
  is kept for settings compatibility; it always meant "the answer's share".
- **Vitest has no `@shared` alias.** A renderer test that imports a component with a runtime
  `@shared/...` import must `vi.mock` it (e.g. by path: `() => import('../../../../shared/x')`).
- **Open Sanas must not route or reload the main renderer.** `LiveMeetingPage` owns the
  microphone capture session; remounting it (a route change, a `loadURL`) would interrupt
  capture. `MainWindowShow` is parameterless and only restores/shows/focuses.
- **The overlay's Context is text-only on purpose.** Its Apply payload never carries `deck`,
  so it cannot change slides; bulk deck editing stays in the main window's
  `MeetingContextEditor`. Both share `lib/meeting/meeting-context-draft.ts`.
- **Overlay CSS must not import `base.css`** — its opaque `body` background would cover the
  transparent window. `overlay.css` imports `tokens.css` and `controls.css` plus the scoped
  `overlay-*.css` layers.

## Presentation mode

- Editing/saving/clearing a job deck applies to the next meeting only. Deck versions are immutable; the active version can change through meeting Apply, independently of the job.
- Slide moves cancel only buffered Next point coaching, clear only coach cards and reset coach thresholds. Never invalidate classifiers or streaming answers on a slide move. Ordinary Stop still permits answers to finish.
- New-visit coaching excludes finalized speech starting before a navigation boundary. Provider timestamps can drift relative to captured audio after reconnect; coverage remains advisory.
- Shortcut Settings shows attempted startup accelerators and registration failures. Saved changes need restart; duplicates, unavailable combinations and invalid accelerators are visible. Slide shortcuts do not focus the overlay and work while paused/ghosted.
- Presentation meetings cannot be merged yet. Recorded slide markers survive re-diarization; scripts do not count as transcript evidence.

## Live-control boundaries

- Transient suggestion IDs key streaming cards; only storedSuggestionId from successful completion can identify a source for More detail. Failed, coach, audience and detail cards cannot be sources. Legacy rows without saved grounding cannot be expanded.
- CompactSuggestion deliberately drops extra prose. Detail must use SuggestionContent/DetailedSuggestion in both overlay and history; model output remains React text, never HTML.
- Typed requests work without capture or transcript and while paused. Busy/rejected admission must retain the draft. Current-window finalized speech is required for audience questions.
- Composer activation may precede renderer startup: retain the intent until readiness. Passive reveals and streaming/context/navigation events never focus the window. Native Windows focus behavior still requires owner acceptance.
- Screen capture: bounds are DIP (negative on monitors left/above the primary); encoding limits apply to the returned image's actual pixels, since Electron does not guarantee the requested thumbnail size. Match displays by `display_id`, never by source order. Windows can return an empty or black capture (locked desktop, protected content, remote session) while reporting access as granted: surface the failure, never disable overlay content protection as a workaround.
- Dense 4K screens can be unreadable at the 1,568 px limit; the prompt asks the owner to enlarge and recapture instead of guessing.
- A screen answer is stored as `manual_kind = 'typed'` with a `[Screen capture]` request-text marker (no schema change). Only `db/repos/` encodes/decodes it via `db/repos/manual-kind.ts`; a raw SQL reader sees "typed".
- Capture admission is checked before acquisition only. A requested answer that starts while a capture is being taken wins; the capture then reports busy. A composer send with a stale draft token is refused (`attachment-expired`), never sent as text alone.
- v7 migration and repository behavior need disposable Electron-ABI checks; mocked unit tests do not establish SQLite foreign-key/rollback guarantees. See the live-controls plan for native acceptance assertions.

## Releases, upgrades and recovery

- Vitest runs on Linux in CI, so PowerShell-dependent tests must be Windows-guarded; the Windows build job still runs the packaged smoke.
- Dev and installed Sanas share APPDATA/sanas. Close both before owner installation/backup; never run
  an older schema build after an upgrade. Future-schema startup fails instead of replacing data.
- Before migration, backups go under APPDATA/sanas/backups with unique names. SQLite backup includes
  committed WAL data. A failed backup aborts migration; a failed later migration can leave earlier
  versions committed. Exit all Sanas processes and preserve the current directory before deliberately
  restoring a backup. Do not copy an old database over live WAL/SHM files.
- A native binding existing on disk is insufficient: package-check checks unpacking/metadata; packaged
  --smoke really opens SQLite, probes a row and checks integrity in a unique temporary userData. It
  skips the instance lock, windows, settings, providers, audio, retention and updater. Only its temp
  directory is removed; reports remain under the worktree .tmp/smoke directory.
- Unsigned installers can trigger SmartScreen. Update SHA-512 integrity is not publisher identity;
  win.verifyUpdateCodeSignature is false explicitly. No tokens ship in the public updater feed.
- Restart is explicit and blocked by live/paused meetings or any background meeting write. Ordinary
  quit never installs. The trimmed design does not guard queued lifecycle work or prevent new work
  after the synchronous click-time check; avoid starting work while restarting.
- npm prepare assumes .git is a directory and fails with ENOTDIR in linked worktrees. Use
  --ignore-scripts for local installs and rebuild native dependencies separately when needed. This
  branch does not change hook installation. Hosted full checkouts run npm ci with lifecycle scripts.

- Packaged smoke uses an explicit .NET process object to retain a reliable GUI exit code in Windows
  PowerShell. Schedule `app.exit` after the readiness continuation returns, and do not remove
  Electron's active userData while it is running: either teardown ordering mistake can leave its
  Network Service child holding the main process open. The wrapper owns and removes the isolated
  directory after exit, allows 60 seconds, then kills only its own process and fails. A successful
  report alone is never a pass: the executable must also exit successfully before the timeout.
