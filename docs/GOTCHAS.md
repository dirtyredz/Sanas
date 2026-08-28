# Sanas — Gotchas

*Non-obvious traps. Read before touching the related area.*

## Audio
- **Windows mic exclusivity/quality:** some conferencing apps grab the mic with
  echo-cancellation/AGC processing. Sanas usually runs while the meeting is on a
  *different* device, but if a meeting ever runs on the same laptop, expect the mic to
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
  (capture setting, on by default); it taps the output signal digitally, pre-speaker.
- **Streaming diarization drifts; batch doesn't.** Live speaker indices are unstable
  (S2 can become S7 mid-meeting) — incremental labeling, no lookahead, conference-
  compressed audio. Don't try to fix it live: the post-meeting batch re-diarization
  pass replaces segments with stable labels. Live view jitter is expected and cosmetic.
- **Re-diarization clears per-meeting speaker names** — batch indices don't match the
  live ones, so stale names would mislabel. Name speakers AFTER the meeting ends.

## APIs
- **Deepgram WS idle timeout:** the socket closes after ~10 s without audio. Send
  keepalive messages (or continuous silence frames) during pauses, and implement
  auto-reconnect with transcript continuity.
- **Interim vs final results:** interims mutate/replace; only persist finals or the
  transcript in SQLite will accrete duplicates.
- **Claude prompt growth:** a long meeting's transcript exceeds sensible prompt sizes —
  always window the transcript (recent N tokens) + optionally a rolling summary;
  never send the whole thing per suggestion.

## Product/legal
- **Recording consent:** some jurisdictions are two-party consent for recording.
  Transcription-without-audio-retention is lighter but not automatically exempt.
  Sanas records/transcribes only on explicit start; audio saving is opt-in per meeting.
