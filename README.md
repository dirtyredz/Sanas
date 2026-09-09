# Sanas

> _Sanas_ (Scottish Gaelic): a whisper, a hint — and a glossary.

A private, local-first **live meeting copilot**. Sanas listens to the room through your
laptop mic, transcribes the conversation in real time, and quietly suggests what to say
next — grounded in the context of whichever job/client the meeting belongs to.

**Not** an interview cheater — a working tool for people juggling multiple jobs/clients,
each with its own projects, jargon, and talking points.

## What it does

- 🎙 **Listens** — per meeting you say where the call is: **This PC** (mic + a digital tap of
  the system audio, so the other side is separated from you by construction) or
  **Elsewhere** (another laptop / the room: everyone through the mic, diarized, you mark
  your own voice)
- 📝 **Transcribes** — Deepgram streaming STT with speaker separation, boosted by your per-job glossary
- 🤖 **Assists** — Claude-powered suggestions in a small always-on-top overlay:
  - _ambient_: short nudges when a question lands or a key moment hits
  - _on-demand_: global hotkey → full "here's what to say" answer
- 🗂 **Organizes** — Jobs → Meetings → transcripts, suggestions, summaries; all in local SQLite

## Stack

Electron (Windows) · Deepgram streaming WS · Claude API (streaming) · better-sqlite3 · local audio files

## Status

Daily-drivable: live transcription, overlay suggestions, jobs + context packs, post-meeting
summaries (emailed per job if you want), search, export. See
[docs/FEATURES.md](docs/FEATURES.md) for the inventory, [docs/ROADMAP.md](docs/ROADMAP.md)
for what is next and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system design.

## Develop

```
npm install        # rebuilds better-sqlite3 for Electron
npm run dev        # electron-vite dev with hot reload
npm run dev:web    # renderer only, in a browser, with a mock of the Electron bridge
npm test           # vitest — pure modules (speaker carry-over)
npm run typecheck && npm run lint && npm run format:check
npm run dist       # Windows installer → release/
```

## Privacy note

Audio is processed by cloud APIs (Deepgram, Anthropic) but **stored only locally**.
Recording conversations may require consent depending on your jurisdiction — Sanas has an
explicit start/stop and never records without you initiating it.
