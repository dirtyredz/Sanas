# Sanas

> *Sanas* (Scottish Gaelic): a whisper, a hint — and a glossary.

A private, local-first **live meeting copilot**. Sanas listens to the room through your
laptop mic, transcribes the conversation in real time, and quietly suggests what to say
next — grounded in the context of whichever job/client the meeting belongs to.

**Not** an interview cheater — a working tool for people juggling multiple jobs/clients,
each with its own projects, jargon, and talking points.

## What it does

- 🎙 **Listens** — mic capture of room audio (you + everyone else, acoustically)
- 📝 **Transcribes** — Deepgram streaming STT with speaker separation, boosted by your per-job glossary
- 🤖 **Assists** — Claude-powered suggestions in a small always-on-top overlay:
  - *ambient*: short nudges when a question lands or a key moment hits
  - *on-demand*: global hotkey → full "here's what to say" answer
- 🗂 **Organizes** — Jobs → Meetings → transcripts, suggestions, summaries; all in local SQLite

## Stack

Electron (Windows) · Deepgram streaming WS · Claude API (streaming) · better-sqlite3 · local audio files

## Status

Pre-code. See [docs/ROADMAP.md](docs/ROADMAP.md) for the build plan and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system design.

## Privacy note

Audio is processed by cloud APIs (Deepgram, Anthropic) but **stored only locally**.
Recording conversations may require consent depending on your jurisdiction — Sanas has an
explicit start/stop and never records without you initiating it.
