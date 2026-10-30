# Presentation mode — implementation record

Owner rulings (2026-10-30) are authoritative: answers use the whole job context and all effective slides. Navigation never cancels classifiers, started answers, or answer cards. Only Next point coaching is slide-scoped, using current-slide content, permitted next-slide lookahead and current-visit finalized speech. The original draft's answer deferral, answer revision cancellation and answer-card isolation requirements were superseded and are removed here.

## Implemented foundation (dk-ba2b0a68)

- Ordered job slides with validation, editing and import; initial meeting snapshot captured atomically.
- Main-owned Previous/Next cursor, serialized with the meeting lifecycle and recorded against captured audio time. Paused navigation increments revision at the same audio timestamp; boundaries do not wrap.
- Separate overlay slide/transcript views and global navigation shortcuts with registration/collision status.
- Complete deck grounding for answers; separate coaching context without the full deck. Current-visit coaching evidence resets on moves and excludes crossing/delayed finals.
- Historical slide markers in MeetingView, export and summaries, ordered before speech at equal audio times and by presentation revision among simultaneous events. Prepared scripts never establish delivered speech.
- Presentation merges refused pending a design for compatible histories.

## Live-controls follow-up (dk-36d14d59)

[Live controls](live-controls.md) implements meeting-local text and live slide replacement, clear, add-first-deck and Restore meeting-start slides. Deck versions are immutable; the active version may change. Historical markers resolve their original version/title. Context edits and navigation reset coaching only. Job edits still affect later meetings, not the active meeting.

Typed requests, source-grounded detail and audience questions reuse the requested lane while live or paused. Detail replays frozen source job/deck context and its original transcript window. Summary regeneration differs: it reads saved context/deck history but rebuilds job background from current job data, rather than a frozen job snapshot.

## Verification boundary

The dispatched fast gate is typecheck, lint and the targeted Vitest list in the live-controls plan. No full build, app launch, native migration, Electron smoke or full unit tier is authorized by that gate. Native/Windows acceptance remains owner work against an isolated disposable database/window session:

- Fresh/v6 migration, preserved IDs/events, foreign keys, transaction rollback, cascades and reopening.
- Long scripts and controls at default/minimum overlay sizes, resize/opacity/split/maximize/ghost behavior.
- Navigation and Apply during classification, buffered coaching and streamed answering; paused/ghost shortcuts; collision reporting.
- Passive display never steals presentation-app focus; explicit Ask activates the composer and Escape releases focus.
- Saved markers and context survive restart/re-diarization; scripts remain background rather than spoken evidence.

Leave the dispatched item wip for owner acceptance; release its worktree claim at handoff. No merge or push is part of this dispatch.

## Deferred

Automatic advancement, contextual merges, external-deck synchronization and coverage scoring. Live deck replacement is implemented by the follow-up, not deferred.
