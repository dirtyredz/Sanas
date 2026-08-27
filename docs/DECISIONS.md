# Sanas — Decisions

*Design/architecture decisions, newest first. Why we chose what we chose, and what we rejected.*

## 2026-08-27 — Name: Sanas
Scottish Gaelic for "whisper / hint" **and** "glossary" — matches the two core mechanics
(whispered suggestions + per-job term glossary). Rejected: cueline, meeting-copilot, cagar, guth.

## 2026-08-27 — Product framing: meeting copilot, not interview tool
User explicitly does **not** want an interview cheater. Sanas is a live copilot for the
multiple real jobs/clients the user works — per-job project scope, company info, jargon,
talking points, persona. This framing drives the context-pack design.

## 2026-08-27 — Platform: Electron desktop (Windows), not PWA
Started as a PWA idea. Two findings flipped it:
1. Meetings often run on a *different* laptop → room audio via mic is the capture path →
   no need for tab/system-audio capture, the PWA's one advantage zone.
2. User is single-device (personal laptop only) → no cross-device sync need → local
   SQLite + filesystem beat IndexedDB; Electron also gives always-on-top overlay +
   global hotkeys, which a PWA cannot do.
Rejected: pure PWA (no overlay/hotkeys, fragile storage); hybrid local-first+sync
(sync solves a problem the user doesn't have).

## 2026-08-27 — Audio capture: microphone only
Room audio through the laptop mic carries both sides of the conversation acoustically.
Rejected: system-audio loopback and `getDisplayMedia` tab capture — unnecessary
complexity for this usage pattern. Tradeoff accepted: mixed/noisy single-channel audio;
mitigated by choosing an STT strong on noisy audio with diarization.

## 2026-08-27 — STT: Deepgram streaming (swappable)
Chosen for: real-time streaming latency (~300 ms), built-in diarization (who said what
from one mic), strong noise handling, keyterm boosting (glossary double-duty), low cost
(~$0.005–0.01/min). Rejected: local Whisper (latency, weak diarization, heavy for a
laptop that's also running a meeting); OpenAI Realtime (less mature diarization).
STT sits behind an interface so the provider can be swapped later.

## 2026-08-27 — Assistant: Claude API, streaming (swappable)
User is in the Claude ecosystem; strong contextual coaching; streaming keeps perceived
latency low. Behind a provider interface like STT.

## 2026-08-27 — Assist UX: hybrid ambient + on-demand
Ambient short nudges on detected key moments (questions from others, silence after a
question), debounced; plus a global hotkey for a full "what do I say" answer.
Rejected: always-on streaming (distracting, costly); on-demand-only (user must remember
to trigger, loses the copilot feel).

## 2026-08-27 — Storage: local SQLite + local audio files
`better-sqlite3` in main process; audio under app data. Single-device by choice.
Rejected: cloud backend (D1/R2) — no multi-device need; can be revisited if that changes.
