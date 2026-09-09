# Sanas — Architecture

_How the system works. For code shape, see [../STRUCTURE.md](../STRUCTURE.md)._

## Overview

Electron desktop app, single-device, local-first. Two windows:

1. **Main window** — library UI: jobs, meetings, transcripts, context packs, settings.
2. **Overlay window** — small frameless always-on-top panel shown during a live meeting;
   displays the rolling transcript tail + AI suggestions. Summoned/dismissed by global hotkey.

## Runtime data flow (live meeting)

```
Mic (getUserMedia, renderer)
  → PCM chunks (AudioWorklet, 16 kHz mono)
  → Deepgram streaming WebSocket        [+ keyterm boosts from the job's glossary]
  → interim + final transcript events (diarized: Speaker 0/1/…)
  → Transcript store (rolling buffer + SQLite persistence)
  → Trigger engine:
      • ambient: question detected / key moment → short nudge
      • hotkey:  user asks → full answer
  → Claude API (streaming) with prompt = job context pack + recent transcript window
  → Suggestion rendered in overlay (streams in token by token)
```

### Audio capture

- **Mic + system-audio loopback (default).** For meetings on THIS PC, driver echo-
  cancellation erases the other side from the mic — so Sanas also taps the signal
  headed to the output device via Electron's display-media loopback
  (`src/main/system-audio.ts`). Channels: **0 = mic (user), 1 = loopback (others)** —
  identity is structural, resolved in one place (`services/meetings/channel-identity.ts`).
- **Mic-only mono fallback** when the capture setting is off, loopback is unavailable,
  or the meeting runs on another device (room audio through the mic, "that's me" pinning).
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
- Speaker labels: heuristic mapping of "which diarized speaker is the user" (the user can
  tap "that's me" on a line to pin it; persisted per meeting).

### Assistance (Claude)

- Model: current Claude Sonnet-tier via Anthropic API, streaming.
- **Prompt assembly:** system prompt = persona/tone + job context pack (company info,
  project scope, notes, talking points, glossary); user turn = recent transcript window
  (last ~N seconds/tokens) + the trigger reason.
- **Ambient triggers** (cheap, local heuristics first): a final transcript segment from a
  non-user speaker that is a question (interrogative detection), long user silence after
  a question, or explicit keywords. Debounced — suggestions never fire more often than a
  floor interval.
- **On-demand trigger:** global hotkey → immediate full-length response.
- Ambient nudges are short (1–2 sentences, "mention the Q3 migration"); on-demand answers
  are fuller. Both logged to the meeting record.

### Storage

- **SQLite** via `better-sqlite3` in the main process (`%APPDATA%/sanas/sanas.db`).
- Audio files under `%APPDATA%/sanas/audio/<meetingId>/`.
- Schema (v1):

```
jobs        (id, name, company_info, project_scope, notes,
             talking_points, persona, created_at, archived,
             summary_email)                 -- per-job recipient (v3)
glossary    (id, job_id, term, note)
meetings    (id, job_id, title, started_at, ended_at,
             audio_path, summary, action_items)
segments    (id, meeting_id, t_start_ms, t_end_ms, speaker,
             is_user, text)              -- final transcript segments
suggestions (id, meeting_id, t_ms, trigger,     -- 'ambient' | 'hotkey'
             prompt_window, text)
speakers    (meeting_id, speaker, name)         -- user-assigned names (v2)
```

### Process/IPC boundaries

- **Main process:** SQLite, filesystem, Deepgram WS client, Claude client, global
  hotkeys, window management, API keys (from local config, never in renderer).
- **Renderer(s):** UI + mic capture only. Audio chunks stream to main over IPC;
  transcript/suggestion events stream back. `contextIsolation` on, no node in renderer.

### External interfaces

| Service       | Purpose                | Data sent                              |
| ------------- | ---------------------- | -------------------------------------- |
| Deepgram WS   | streaming STT          | live audio, glossary terms             |
| Anthropic API | suggestions, summaries | transcript excerpts, job context pack  |
| SMTP (user's) | summary email          | summary + action items (no transcript) |

Keys and the SMTP password stored locally in the app config. The summary email goes only
to the address set on the meeting's job; nothing else leaves the machine.

## Post-meeting

On meeting end, two fire-and-forget passes:

1. **Summary** — one Claude call generates summary + action items; stored on the meeting row.
   Then `MeetingUpdated` is broadcast and, if auto-email is on, the summary is emailed.
   The meeting view can also re-run it on demand from the full stored transcript
   (`summarizeStoredMeeting`), rebuilding the job context prompt from the DB.
2. **Re-diarization** — the recorded WAV goes through Deepgram's batch API
   (`SttProvider.transcribeFile`); batch diarization sees the whole file, so speaker
   labels are stable. Live segments are replaced wholesale (streaming labels drift).
   Speaker names/merges are then user-editable per meeting in the transcript view.
