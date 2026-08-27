# Sanas — Architecture

*How the system works. For code shape, see [../STRUCTURE.md](../STRUCTURE.md).*

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

- **Mic only.** The user's meetings often run on a *different* device with room speakers,
  so the laptop mic hears both sides acoustically. No system-audio loopback needed.
- Renderer captures via `getUserMedia`; an `AudioWorklet` downsamples to 16 kHz mono
  PCM (linear16) chunks for Deepgram.
- Raw audio is optionally saved to disk (`.wav`/`.ogg`) per meeting, user-controlled.

### Transcription (Deepgram)

- Streaming WebSocket, `nova-3` model (or current best), `diarize=true`,
  `interim_results=true`, `smart_format=true`.
- The active job's **glossary terms are sent as keyterm boosts** — the same data that
  feeds the AI also improves STT accuracy on jargon. (This is the *sanas* double meaning.)
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
             talking_points, persona, created_at, archived)
glossary    (id, job_id, term, note)
meetings    (id, job_id, title, started_at, ended_at,
             audio_path, summary, action_items)
segments    (id, meeting_id, t_start_ms, t_end_ms, speaker,
             is_user, text)              -- final transcript segments
suggestions (id, meeting_id, t_ms, trigger,     -- 'ambient' | 'hotkey'
             prompt_window, text)
```

### Process/IPC boundaries

- **Main process:** SQLite, filesystem, Deepgram WS client, Claude client, global
  hotkeys, window management, API keys (from local config, never in renderer).
- **Renderer(s):** UI + mic capture only. Audio chunks stream to main over IPC;
  transcript/suggestion events stream back. `contextIsolation` on, no node in renderer.

### External interfaces

| Service | Purpose | Data sent |
|---|---|---|
| Deepgram WS | streaming STT | live audio, glossary terms |
| Anthropic API | suggestions, summaries | transcript excerpts, job context pack |

Both keys stored locally in the app config. Nothing else leaves the machine.

## Post-meeting

On meeting end: one Claude call generates summary + action items from the full
transcript; stored on the meeting row and shown in the library.
