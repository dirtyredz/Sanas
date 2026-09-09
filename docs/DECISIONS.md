# Sanas — Decisions

_Design/architecture decisions, newest first. Why we chose what we chose, and what we rejected._

## 2026-09-09 — Meeting source is a per-meeting choice, not a global capture setting

Field report: a call held on another laptop, with the default "capture system audio" on,
labelled every participant as **Me**. Loopback is always available on Windows, so capture
went stereo and the stereo rule (mic channel = user) stamped the whole room as the user —
with no diarization index left to pin. The fact that decides identity ("does the other
side arrive through this PC's output, or through the mic?") is a property of the meeting,
so it is now asked on the Live page per meeting — **This PC** (stereo, channel = identity)
or **Elsewhere** (mono, diarized, "that's me" pinning) — and remembered as the default
for the next one. Default is Elsewhere: the failure mode of a wrong Elsewhere is jittery
labels, the failure mode of a wrong This PC is a silently useless transcript.
Alongside: batch re-diarization re-numbers voices, which used to discard pins and names;
they are now carried over by time overlap (`speaker-carryover.ts`), so mono meetings keep
their "Me" after the record heals.
Rejected: auto-detecting from "loopback channel is silent" (only knowable after the fact,
and a muted call looks the same); keeping the global toggle as a default (the user would
still have to remember it before each meeting).

## 2026-09-08 — Summary email via SMTP (nodemailer), summary-only body, recipient per job

The user wants a meeting summary delivered to a predefined address without touching a
mail client. The **recipient lives on the job** (`jobs.summary_email`), not in Settings —
each client/job has its own stakeholder, and a job with no address simply never emails.
Only the sending account (SMTP) is global. Chosen: direct SMTP from the main process (nodemailer) with host/login/
app-password in Settings — fully hands-off, works with any provider, and can auto-send on
stop. The email carries **summary + action items only**; the transcript stays local
(Export exists for that). This is the first outbound path besides the two API vendors —
recorded as an exception to "nothing else leaves the machine": only the summary leaves,
only to the address the user typed. SMTP password shares the API keys' storage model.
Rejected: `mailto:` draft (not hands-off; body length limits); Gmail API/OAuth (needs a
GCP client + browser flow for one recipient); Resend/SendGrid (a third vendor account).

## 2026-08-28 — Post-meeting batch re-diarization + speaker rename/merge

Streaming diarization drifts badly on real meetings (a speaker labeled S2 shifts to S7
mid-standup) — it labels voices incrementally with no lookahead, on conference-processed
audio. Two-part fix: (1) on meeting end, re-transcribe the recorded WAV through
Deepgram's batch API (whole-file lookahead → stable labels) and replace the live
segments; (2) per-meeting speaker rename ("Sarah") and merge (fold S7 into S2) in the
meeting view. Live view stays jittery by nature; the record heals. Requires
`recordAudio` (now default ON). AI assist was never affected — me/them comes from the
channel split.

## 2026-08-28 — System-audio loopback capture (supersedes "microphone only")

Real-world finding: for meetings on the SAME PC, driver-level echo cancellation
subtracts speaker output from the mic signal — exactly erasing the other participants
while keeping the user. Speakers-at-full-volume doesn't help.
Fix: Electron `setDisplayMediaRequestHandler` with `audio: 'loopback'` (Windows) taps
the signal headed to the output device digitally — no AEC in the path, works with
headphones. Runs alongside the mic as a second channel; Deepgram `multichannel=true`
transcribes each independently, so **channel 0 = user, channel 1 = others by
construction** — me/them no longer depends on diarization. Mic-only mono remains the
fallback (setting off, loopback unavailable, or meeting on another device).
Rejected: mixing loopback+mic into one mono stream (loses the free identity split).

## 2026-08-27 — Name: Sanas

Scottish Gaelic for "whisper / hint" **and** "glossary" — matches the two core mechanics
(whispered suggestions + per-job term glossary). Rejected: cueline, meeting-copilot, cagar, guth.

## 2026-08-27 — Product framing: meeting copilot, not interview tool

User explicitly does **not** want an interview cheater. Sanas is a live copilot for the
multiple real jobs/clients the user works — per-job project scope, company info, jargon,
talking points, persona. This framing drives the context-pack design.

## 2026-08-27 — Platform: Electron desktop (Windows), not PWA

Started as a PWA idea. Two findings flipped it:

1. Meetings often run on a _different_ laptop → room audio via mic is the capture path →
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

Chosen for: real-time streaming latency (~~300 ms), built-in diarization (who said what
from one mic), strong noise handling, keyterm boosting (glossary double-duty), low cost
(~~$0.005–0.01/min). Rejected: local Whisper (latency, weak diarization, heavy for a
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
