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

## Windows releases and updates

Use Node 22, PowerShell (7 recommended; Windows PowerShell also supported) and authenticated GitHub CLI for the owner scripts. Dependencies must
already be installed. After merging/pushing an approved change, run:

```powershell
pwsh -NoProfile -File scripts/release/start.ps1 -DryRun
pwsh -NoProfile -File scripts/release/start.ps1
```

The main-only manual workflow stamps a disposable build, verifies, builds unsigned x64 NSIS,
checks the package and isolated SQLite smoke, then uploads three assets to a draft and publishes.
The dispatch script records the intended SHA and uniquely identified run URL. It never merges or
pushes. Owner logs are under .tmp/owner-runs. Inspect Actions and Releases before retrying any
uncertain failure. Failed draft cleanup requires manual inspection; never delete a published
release to reuse its version. The updater feed is public dirtyredz/Sanas, without a client token.

For first installation, exit both dev and installed Sanas, then run:

```powershell
pwsh -NoProfile -File scripts/release/install-latest.ps1 -DryRun
pwsh -NoProfile -File scripts/release/install-latest.ps1
```

The script verifies installer hashes/metadata, cold-copies the complete APPDATA/sanas directory
(including settings, recordings and WAL/SHM) into a unique APPDATA/sanas-backups directory, verifies
its hash manifest, installs and checks the executable version. Dry runs only write logs. Launch
Sanas and confirm existing jobs, meetings, transcripts and playable recordings; no import is needed.
Unsigned installers may show SmartScreen warnings. Do not share backups: they contain private data.

Settings ? Updates checks/downloads automatically and offers Restart to update after downloads.
Stop even paused meetings and wait for background processing first. Ordinary quit never installs.
Before database schema upgrades, consistent backups are also saved under APPDATA/sanas/backups.
On startup failure, keep the current data and backup, exit all Sanas instances, and recover manually
from a verified backup (including deliberate handling of WAL/SHM); never restore over a live DB.
Do not launch an older dev build against a newer schema.

For main-process startup or runtime failures, inspect `%APPDATA%\sanas\logs\sanas-main.log` (and
`sanas-main.log.1` for the previous capped file). API-key-shaped values are redacted.

Local acceptance: npm run typecheck, npm run lint, npm test, npm run format:check, then npm run dist,
node scripts/release/package-check.mjs and pwsh -NoProfile -File scripts/release/smoke.ps1. Dist
never publishes. Smoke creates no window and uses disposable data. Native migration fixture suites
and remote readback were excluded from the trimmed plan. The first real update after a subsequent
release remains the installed-upgrade acceptance check.

Manual checklist per release: overlay excluded during screen sharing; microphone and This-PC
system audio capture; real Deepgram/Anthropic meeting calls; Settings states and safe restart;
retained jobs, transcripts and playable recordings after installation.
