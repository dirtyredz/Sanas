# Sanas — Gotchas

_Non-obvious traps. Read before touching the related area._

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
  pass replaces segments with stable labels. Live view jitter is expected and cosmetic.
- **Re-diarization re-numbers the voices.** Batch indices don't match the live ones, so
  "that's me" pins and speaker names are carried over by time overlap (a voice that keeps
  > 50% of its speaking time on one new index keeps its name/identity). A voice batch
  > splits differently may need re-naming; check the transcript after the meeting ends.
- **"Everyone showed up as Me."** In This-PC (stereo) mode the mic channel is stamped as
  the user by construction — the other side is supposed to arrive on the loopback channel.
  Run that mode for a call held on another laptop or in the room and every voice the mic
  hears becomes "Me", with no diarization index to pin. The meeting source is therefore a
  per-meeting choice on the Live page (default Elsewhere), never a global setting.

## Storage

- **Deleting a meeting is two deletes.** The row (segments, suggestions, names cascade) and
  the WAV on disk. `db/repos/meetings.deleteMeeting` is row-only by design — go through
  `services/meetings/remove.ts` (`removeMeeting`) from anywhere outside repos, or the file
  stays behind. Retention and the Delete button both use it. If the WAV is locked by another
  program the row is kept too (a file without a row is an orphan): Delete shows "still in use —
  try again", retention counts it as failed and retries next run.
- **`segments_fts` is external-content: never write to it by hand.** Rows are added and
  removed by the triggers on `segments`. A cascade delete from `meetings` does NOT run those
  triggers reliably, so `removeMeeting` deletes the segments row by row first. Rebuilding is
  `INSERT INTO segments_fts(segments_fts) VALUES ('rebuild')` if the index ever drifts.
- **User text never touches the FTS5 grammar.** `db/fts-query.ts` quotes every token; a raw
  `MATCH ?` with user input would throw on an unbalanced quote or a stray `NEAR`. Search
  ANDs with a prefix on the last word; Ask ORs content words with stopwords dropped.
- **Retention compares SQLite datetime text.** `ended_at` is `datetime('now')` (UTC,
  `YYYY-MM-DD HH:MM:SS`); the cutoff is built in the same shape so a plain `<` works. A
  meeting with no `ended_at` (still running, or the app died mid-meeting) is never purged.

## APIs

- **Deepgram WS idle timeout:** the socket closes after ~10 s without audio. Send
  keepalive messages (or continuous silence frames) during pauses, and implement
  auto-reconnect with transcript continuity.
- **Interim vs final results:** interims mutate/replace; only persist finals or the
  transcript in SQLite will accrete duplicates.
- **Claude prompt growth:** a long meeting's transcript exceeds sensible prompt sizes —
  always window the transcript (recent N tokens) + optionally a rolling summary;
  never send the whole thing per suggestion.
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
