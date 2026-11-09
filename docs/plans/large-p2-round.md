## 1. dk-0af7b509 — Replay PCM buffered during reconnect

### Goal

Recover audio received during a brief Deepgram disconnection by buffering and replaying unsent PCM in order. Preserve recording-aligned timestamps, bounded memory, and existing cancellation behavior.

This covers unsent audio during backoff and failed sends. It cannot guarantee recovery of audio successfully handed to a socket but never acknowledged or transcribed.

### Placement

Paths are relative to the repository root.

| File                                                                                | Responsibility                                                                                                                              |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **New:** `src/main/services/stt/deepgram/recovery/pcm-backlog.ts` and adjacent test | Bounded FIFO of owned PCM buffers and their original byte positions. Use a responsibility subfolder because `deepgram/` is already crowded. |
| `src/main/services/stt/deepgram/deepgram-session.ts`                                | Compose queue, socket recovery, paced draining, watchdog, and shutdown.                                                                     |
| `src/main/services/stt/deepgram/deepgram-session.test.ts`                           | Extend existing fake-socket coverage; replace expectations that backoff audio disappears.                                                   |
| `src/main/services/meetings/index.test.ts`                                          | Verify replay never advances the meeting clock or writes recording audio twice.                                                             |
| `src/main/services/stt/types.ts`                                                    | Change only if recovery needs a typed terminal reason; keep buffering provider-owned.                                                       |

No replay machinery belongs in main audio ingress, IPC, or the WAV writer.

### Sequence

1. Before implementation writes, run `docket guide`, read and claim the item through `dk`. Read-only planning does not claim or modify it.
2. Add queue tests, then implement entries containing original byte start and a copied buffer. Count input bytes exactly once.
3. Route unsent PCM into the FIFO. Retain a synchronously throwing send and its unattempted suffix; remove a chunk only after successful socket handoff.
4. Drain oldest-first after reconnect, ahead of newer live audio. Freeze the replacement socket’s offset at the original position of its first transmitted queued chunk. Apply that offset to transcripts, interims, VAD, and boundaries.
5. Bound both the application FIFO and socket `bufferedAmount`. Use a cancellable pump with limited work per iteration so draining cannot monopolize main.
6. Use a **30-second PCM backlog** as the initial supported limit: approximately 960 KB mono or 1.92 MB stereo. On overflow, enter the existing error-to-pause path with an explicit buffer-full message. Do not discard an internal slice and continue with a falsely contiguous provider timeline.
7. Make recovery own failures during initial draining. Currently `recovering` remains true during `connect()`; a replay send failure must advance the recovery loop rather than be ignored or reported as a successful reconnect.
8. Clear queues and pumps on Stop, terminal recovery failure, or session replacement. Preserve fencing of retired socket callbacks and exactly one reset per failed connection.

### Tests

Use fake sockets and clocks:

- Backoff PCM precedes newly arriving PCM byte-for-byte.
- Mono/stereo positions, fractional chunk durations, resumed offsets, and multiple reconnects remain WAV-aligned.
- Failed opens retain queued audio; a failed drain retains only the unsent suffix.
- Caller mutation cannot alter retained buffers.
- High `bufferedAmount` pauses draining without losing order.
- Overflow pauses explicitly; Stop during backoff/open/drain cannot resurrect work.
- Every normalized event uses the replay origin.
- Recording and meeting audio cursor advance once per accepted capture chunk.
- Late events from retired sockets remain ignored.

### Fast-gate verification

The implementer must run:

- `npm run gate`
- `npm test -- src/main/services/stt/deepgram src/main/services/meetings/index.test.ts`
- `npm run build`

Exercise recovery using the fake WebSocket harness. The rehearsal audio/socket-fault tier uses real Deepgram and is outside this gate.

### Docs

- `docs/ARCHITECTURE.md`: bounded unsent-audio replay and original-position offsets.
- `docs/GOTCHAS.md`: replace “backoff audio reaches WAV only”; document overflow and unacknowledged-audio limitations.
- `docs/DECISIONS.md`: bounded replay supersedes the November 5 no-replay behavior.
- `docs/FEATURES.md`: brief outages recover buffered transcription audio.
- `STRUCTURE.md`: add `deepgram/recovery/` ownership.

### Risks, assumptions, and size

Thirty seconds does **not** cover every retry: connection attempts themselves can take ten seconds. Pausing on overflow deliberately favors bounded memory and honest continuity.

Replay preserves transcript content within its supported window; it does not reconstruct an unfinished pre-reset assistance turn. Backlog results may arrive quickly, so downstream identity reset must happen before they are delivered.

**Estimate: medium, 2–3 engineering days**, including deterministic integration coverage.

---

## 2. dk-5c5a3066 — Preserve historical identity and request safe re-pinning

### Goal

Prevent reconnects and resume from silently transferring “Me” to another voice or rewriting earlier participants. Preserve previously confirmed identity and prompt the user to identify their voice on the new connection.

The item explicitly permits re-pinning. This plan chooses that supported behavior rather than unverified voice matching.

### Placement

| File                                                                                       | Responsibility                                                                                                         |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **New:** `src/main/services/meetings/capture/speaker-session.ts` and adjacent test         | Connection-scoped raw-speaker mapping, meeting-local speaker IDs, confirmed pins, and reconfirmation state.            |
| `src/main/services/meetings/capture/channel-identity.ts` and test                          | Resolve mapped IDs and explicit identity uncertainty while preserving stereo identity.                                 |
| `src/main/services/meetings/index.ts` and test                                             | Thin lifecycle, transcript-mapping, state-publication, and pin-validation wiring.                                      |
| **New:** `src/shared/meeting/speaker-identity.ts`; `src/shared/types.ts`                   | Renderer-safe identity status referenced from `MeetingState`; no provider-specific epoch API.                          |
| `src/main/services/meetings/assist/live-session.ts`; `assist/automatic/live-assistance.ts` | Invalidate identity-dependent work and explicitly suspend automatic admission during reconfirmation.                   |
| **New:** `src/renderer/src/app/meeting/speakers/LiveSpeakerControls.tsx` and adjacent test | Extract the live pin picker from `app/pages/LiveMeetingPage.tsx` rather than expanding that mixed-responsibility page. |
| `src/renderer/src/app/pages/LiveMeetingPage.tsx`; `overlay-app/shell/OverlayStatus.tsx`    | Consume authoritative identity state and display the persistent re-pin cue.                                            |
| `src/renderer/src/dev/mock-live-meeting.ts`; `dev/mock-api.ts`                             | Preview state follows the same contract.                                                                               |
| `src/main/db/repos/segments.ts`; `services/meetings/rediarize/speaker-carryover.test.ts`   | Preserve existing SQL behavior; regression-test that new IDs isolate relabeling and retain batch overlap carryover.    |

Place any new repository regression test under a responsibility subfolder rather than adding another loose repository-root file. Existing IPC/preload pin signatures can remain unchanged.

### Sequence

1. Reproduce raw-index reuse across reset and resume, including the historical-row corruption caused by re-pinning.
2. Introduce monotonically allocated, meeting-local nonnegative speaker IDs for mono. Map each connection’s raw provider IDs independently. Preserve `-1` semantics and stereo channel identity.
3. Start a fresh mapping before replacement-connection transcripts can arrive. Initial Start, reconnect, and resume must each establish exactly one effective mapping epoch.
4. Preserve historical pins. If a prior user identity requires reconfirmation, publish `identityNeedsConfirmation` and treat new mono speech as uncertain.
5. **Explicitly gate automatic answering during reconfirmation.** Merely assigning role `unknown` is insufficient: current question selection admits non-user roles. Cancel pending identity-dependent work, suppress new automatic candidates and coaching, and keep manual Answer now available.
6. Accept pins only for speaker IDs belonging to the current meeting. A current-connection pin clears reconfirmation and relabels only that mapped ID. Correcting a historical ID must not confirm the new connection.
7. Replace the Live page’s optimistic pin set with main-owned selected/current IDs. Await pin failures. Show “Identify your voice again” in Live and the overlay, using the existing Open Sanas control.
8. Retain existing repository updates and batch overlap rules: unique meeting-local IDs make their current semantics safe without a migration.

### Tests

- Same raw index after reconnect maps to a different meeting-local ID.
- Raw index reassignment never transfers a pin.
- Re-pinning new speech leaves earlier rows and labels unchanged.
- Historical corrections cannot clear current reconfirmation.
- Reset/resume cancel pending work; automatic admission stays suspended until confirmation.
- Manual Answer now remains available.
- Stale provider callbacks cannot allocate IDs in the new connection.
- Stereo behavior and batch identity carryover remain unchanged.
- Live/overlay cues persist, clear after successful confirmation, and survive failed pin requests.
- Combined replay test: queued speech receives the new connection’s identity mapping.

### Fast-gate verification

Run:

- `npm run gate`
- `npm test -- src/main/services/meetings/capture src/main/services/meetings/index.test.ts src/main/services/meetings/rediarize/speaker-carryover.test.ts src/main/services/meetings/assist/automatic/channel-counterfactual.test.ts src/renderer/src/app/meeting/speakers src/renderer/src/app/pages/LiveMeetingPage.test.tsx`
- The added repository and overlay status tests.
- `npm run build`

Use scripted transcript/reset events and renderer fixtures only.

### Docs

- `docs/ARCHITECTURE.md`: meeting-local speaker IDs, reconfirmation, and automatic-admission behavior.
- `docs/GOTCHAS.md`: raw indices are connection-local; re-pin after reconnect/resume.
- `docs/DECISIONS.md`: choose explicit reconfirmation over unsupported voice inference.
- `docs/FEATURES.md`: historical identity survives; new connection identity requires confirmation.
- `STRUCTURE.md`: speaker-session policy and extracted live controls.

### Risks, assumptions, and size

This intentionally interrupts automatic assistance while identity is uncertain. It does not promise seamless voice recognition.

Existing rows need no migration; the new mapping applies to newly started live meetings. Historical pin corrections remain possible and must also retract affected coaching evidence from item 4.

**Estimate: medium-large, 3–4 engineering days.**

---

## 3. dk-a14215be — Suppress duplicate automatic/Answer-now cards

### Goal

Give each question occurrence one reusable answer across automatic and Answer-now paths, including asynchronous retrieval and classifier races. Preserve independent lanes for different questions and allow recovery after failed or empty answers.

Cut-off handling, clarification restraint, and the factual 40-word ceiling with an approximately 30-word aim already exist. Preserve and verify them rather than implementing another prompt policy.

### Placement

| File                                                                                                           | Responsibility                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/main/services/turns/turn-assembler.ts`; `turns/latest-question.ts` and tests                              | Expose the existing stable turn ID, channel, and answered revision through open/completed question projections. |
| **New:** `src/main/services/meetings/assist/suggestion/answers/answer-coverage.ts` and adjacent test           | Pure bounded cross-lane reservation and delivered-answer registry. Distinct from stacked-question bookkeeping.  |
| **Extract:** `src/main/services/meetings/assist/manual/answer-now.ts` and adjacent test                        | Answer-now selection, retrieval, reservation, dispatch, and reuse.                                              |
| `assist/automatic/live-assistance.ts`; `automatic/speculative-answer.ts`; `automatic/question-ledger.ts`       | Integrate scoped ownership and cancel matching unpublished work.                                                |
| `assist/suggestion/suggestion-runner.ts`; `suggestion/run-publication.ts`; `suggestion/suggestion-requests.ts` | Authoritative publication/settlement hooks and internal occurrence metadata.                                    |
| `assist/live-session.ts`                                                                                       | Own registry lifetime and wire reuse events.                                                                    |
| `src/shared/live-controls/types.ts`; `src/shared/ipc.ts`; `src/preload/index.ts`                               | Typed main-originated select-existing-answer notification.                                                      |
| `src/renderer/src/lib/suggestions/whisper-history.ts`; `useSuggestionHistory.ts`                               | Select an existing card without appending another history entry.                                                |
| `src/main/services/meetings/observation/diagnostics.ts`                                                        | Bounded duplicate/reuse outcome categories for existing evidence.                                               |

Review the existing Answer-now callers in `meetings/index.ts`, `main/ipc/index.ts`, `main/lifecycle/start.ts`, and renderer controls. Preserve their invocation signatures where the main-originated reuse event suffices.

`live-assistance.ts` is already **759 lines**. The Answer-now extraction is required before adding this policy. Do not add loose files to `automatic/`.

### Sequence

1. Write reproductions first: automatic published before Answer now; Answer now before delayed classification; Answer now during unpublished speculation.
2. Carry the assembler’s existing occurrence ID through `OpenTurnView` and `QuestionTurn`. Identify answers by meeting, occurrence, and the exact finalized evidence revision. A later occurrence with identical words remains distinct.
3. Implement synchronous, token-owned reservations before history retrieval. Recheck ownership before dispatch and promotion. Bound completed retention to the question-selection window; retain active entries until settlement.
4. Extract Answer now from the coordinator.
5. Apply these rules:
   - Answer now supersedes matching **unpublished** automatic work and generates the normal Full request.
   - A matching already published or successfully completed answer is selected instead of regenerated.
   - No-op, discarded, failed, cancelled, and timed-out attempts release coverage for an explicit retry.
   - Different questions, typed requests, capture, audience requests, More detail, and coaching retain their current policies.
6. Track every occurrence actually included in stacked automatic requests. Remove only covered members from pending questions. Do not clear unrelated questions when Answer now succeeds.
7. Treat a partial question’s expanded final evidence as a new revision. An answer to “some of the Node…” must not suppress a later materially expanded ask. Exact normalized evidence equality is the conservative initial rule; avoid fuzzy semantic deduplication.
8. Use runner-owned lifecycle hooks for reservation/publication/settlement. Best-effort diagnostic observers must not control admission.
9. Add card reselection for both overlay invocation and the global shortcut. Carry enough existing-card data to restore a card evicted from renderer history without generating or persisting another answer.
10. Add a canned work-authorization fixture proving accepted classification reaches an answer. The item does not establish why the historical question was missed; do not invent that diagnosis.

### Tests

- Both classifier/history-resolution race orders and repeated presses during retrieval.
- Matching automatic/Answer-now work produces one visible card and one successful persisted answer.
- Superseded speculation may have incurred a request, but never publishes a second card.
- Reuse while streaming and after completion.
- Stacked-question subset overlap preserves uncovered questions.
- Same words in a later turn remain eligible.
- Expanded partial questions remain eligible.
- Failure/no-op permits explicit retry; stale settlement cannot release newer ownership.
- No cross-meeting reuse; pause, reset, identity changes, and context revisions have defined behavior.
- Strict speculative prompt equality remains unchanged.
- Reuse selects rather than appends, through button and shortcut.
- Existing cut-off, clarification, and factual-depth prompt tests remain.
- Work authorization with canned acceptance answers; classifier failure still fails closed.

### Fast-gate verification

Run:

- `npm run gate`
- `npm test -- src/main/services/turns src/main/services/meetings/assist src/main/services/assistant src/renderer/src/lib/suggestions`
- Affected IPC, shortcut, and overlay tests.
- `npm run build`

Use fake clocks and canned providers. Do not run the paid topic-switch evaluation.

### Docs

- `docs/ARCHITECTURE.md`: occurrence ownership, publication, recovery, and reuse.
- `docs/DECISIONS.md`: explicit requests replace unpublished speculation; published answers are reused.
- `docs/GOTCHAS.md`: occurrence identity differs from text similarity; partial revisions remain eligible.
- `docs/FEATURES.md`: Answer now selects an existing answer when available.
- `STRUCTURE.md`: extracted manual controller and answer registry.

### Risks, assumptions, and size

Reusing a Smart/Points automatic card means Answer now does not generate a second Full card for that same revision. **New Answer-now generation remains Full**, with unchanged models and budgets; expansion uses existing More detail. This is the planned product tradeoff and must be documented explicitly.

Partial failed cards remain retryable. Avoiding a second card after failure would require a larger replacement-card lifecycle and is outside this plan.

**Estimate: large, 3–5 engineering days.**

---

## 4. dk-1a596f08 — Remember meeting-wide talking-point evidence

### Goal

Give Next point bounded evidence of relevant job talking points and notes discussed earlier in the meeting, even after those transcript lines leave the rolling window.

Keep the current-topic rule: coverage prevents repetition; it must not turn unmentioned job topics into an agenda.

### Placement

| File                                                                               | Responsibility                                                                                          |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **New:** `src/main/services/assistant/coach/coverage/catalog.ts` and adjacent test | Deterministic catalog from Start-time talking points and notes.                                         |
| **New:** `src/main/services/assistant/coach/coverage/ledger.ts` and adjacent test  | Bounded associations between catalog points and actual finalized user speech, with identity provenance. |
| `src/main/services/meetings/assist/meeting-prompts.ts` and test                    | Create the catalog from the same frozen job values used for grounding.                                  |
| `assist/live-session.ts` and test                                                  | Own meeting lifetime, ingest evidence, handle identity correction, and snapshot coverage.               |
| `assist/suggestion/suggestion-requests.ts` and test                                | Pass coverage exclusively to coach requests.                                                            |
| `src/main/services/assistant/coach/coach-prompts.ts` and test                      | Render bounded evidence and anti-repeat instructions.                                                   |

Do not add coverage machinery to the nearly capped automatic coordinator or broaden `ShownLedger` into speech memory.

### Sequence

1. Build the catalog once at Start from actual `job.talkingPoints` and `job.notes`. Do not parse the generated system prompt or reread later job edits.
2. Split bullets, sentences, and paragraphs deterministically; preserve source and stable IDs. Bound the catalog to **128 points** and mark truncation explicitly.
3. Associate confirmed-user finals with points using conservative phrase/token matching. Store actual quotes, not a lexical-overlap-derived `covered=true`.
4. Retain at most two bounded, complete excerpts per point, with speaker identity and audio-span provenance. Avoid clipping away negation. Deduplicate equivalent fragments; preserve evidence when the 200-line prompt window advances.
5. Accumulate while coaching is disabled. Preserve evidence across pause/resume, reconnect, and meeting-context Apply. Reset only for a new meeting.
6. On an identity correction, remove that speaker’s contributions. Reconfirmation invalidating future identity must not erase earlier trustworthy speech. Re-pinning may reconsider available current-window finals; do not claim complete historical reconstruction without retained evidence.
7. Add an immutable coach-only snapshot, capped at **3,000 characters**, prioritizing points relevant to the current question/explanation. Label omissions as incomplete.
8. Tell the existing coach call what the quotes establish and instruct it to avoid repetition. Never treat shown suggestions, job notes, unknown speakers, or other speakers as evidence that the user delivered a point.
9. Preserve existing buffered delivery, context/epoch checks, model, deadline, and cooldown.

### Tests

- A point spoken early remains available after more than 200 finals and 6,000 transcript characters.
- Replay/duplicate finals do not multiply evidence.
- Other/unknown speech and interims do not become user evidence.
- Negation, weak overlap, and conflicting statements never become asserted delivery.
- Suggestions shown are distinct from speech delivered.
- Bounds and truncation remain explicit; older retained evidence is not evicted merely because time passes.
- Speaker correction removes only affected contributions.
- Pause/resume, reconnect, context Apply, and coaching-off accumulation preserve appropriate evidence.
- Snapshots remain immutable during generation.
- Coverage appears only in coach prompts; answer/speculation equality is unaffected.
- Current-topic restrictions remain present.

### Fast-gate verification

Run:

- `npm run gate`
- `npm test -- src/main/services/assistant/coach src/main/services/meetings/assist/live-session.test.ts src/main/services/meetings/assist/meeting-prompts.test.ts src/main/services/meetings/assist/suggestion/suggestion-requests.test.ts`
- `npm run build`

Use canned coach responses for wiring tests. These tests establish evidence retention and prompt contracts, not semantic model quality.

### Docs

- `docs/ARCHITECTURE.md`: meeting-lifetime quoted evidence alongside short current context.
- `docs/GOTCHAS.md`: uncertain/incomplete coverage, correction handling, and suggested-versus-spoken distinction.
- `docs/DECISIONS.md`: no additional inference calls; evidence association rather than asserted semantic completion.
- `docs/FEATURES.md`: Next point can consider earlier confirmed-user discussion.
- `STRUCTURE.md`: `assistant/coach/coverage/` owns policy; `LiveSession` owns lifetime.

The item’s 6,000-character description is stale: current coaching uses a 2,500-character background, 2,000-character explanation, and 1,000-character question. Record that correction through `dk` during implementation.

### Risks, assumptions, and size

Local matching misses paraphrases and cannot certify semantic coverage. Actual quotes let the existing coach reason conservatively without another paid call. Complete semantic coverage of arbitrary notes is not promised.

**Estimate: medium, 2–3 engineering days.**

---

## 5. dk-100a86c3 — Calibrate capture time with explicit uncertainty

### Goal

Associate accepted capture-audio positions with bounded main-monotonic time intervals, then derive speech-end-to-first-readable timing only when the question’s endpoint has a valid mapping.

Keep `audioCursorGapMs` explicitly a proxy. Extend existing latency evidence; add no database migration or separate telemetry service.

### Placement

| File                                                                                        | Responsibility                                                                                                  |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **New:** `src/shared/meeting/audio-capture.ts`                                              | Typed PCM envelope, capture generation, sample positions, and bounded calibration messages.                     |
| `src/renderer/public/downsample-processor.js`                                               | Stamp output with exact source/output sample positions and answer calibration probes. Keep it a static worklet. |
| **New:** `src/renderer/src/audio/capture-clock.ts` and adjacent test; change `audio/mic.ts` | Worklet/probe bridge, capture generation, and cleanup.                                                          |
| **Move:** `src/main/ipc/audio-chunk.ts` and test into `src/main/ipc/audio/`                 | Group existing ingress with new calibration validation/registration; reduce loose IPC breadth.                  |
| **New:** `src/main/services/meetings/capture/timing/capture-clock.ts` and adjacent test     | Pure bounded interval mapping and invalidation policy.                                                          |
| **New:** `capture/timing/capture-session.ts` and adjacent test                              | Compose accepted sample positions, probes, generations, and lifecycle.                                          |
| `src/main/services/meetings/index.ts`                                                       | Thin accepted-ingress and final-endpoint wiring.                                                                |
| `src/shared/ipc.ts`; `src/preload/index.ts`; `src/main/ipc/index.ts`                        | Typed bridge and audio registration.                                                                            |
| `src/main/services/turns/types.ts`; `turn-assembler.ts`; timing tests                       | Carry endpoint evidence without changing turn policy.                                                           |
| `src/main/services/meetings/assist/latency/latency.ts`; `latency-summary.ts` and tests      | Derive bounded durations and report valid/missing counts.                                                       |
| `src/main/diagnostics/rehearsal/runner/clock.ts`; `runner/evidence.ts`; `audio/wav.test.ts` | Supply explicit synthetic capture evidence and verify known sample positions.                                   |
| `scripts/rehearsal/trials/summarize.mjs` and test                                           | Include calibrated distributions using the existing summary rules.                                              |
| `src/renderer/src/dev/mock-api.ts`                                                          | Update preview bridge compatibility.                                                                            |

Update capture ownership callers in `lib/meeting/start-captured-meeting.ts`, `app/pages/LiveMeetingPage.tsx`, and `app/mock-interview/useMockInterview.ts` if adopting a capture generation changes their contract. Keep new implementation inside `audio/`, not the crowded renderer helper directory.

### Sequence

1. Establish the evidence contract with pure tests. Record integer sample positions, channel count, capture generation, and sequence number alongside PCM. Main stamps receipt before sink work.
2. Bind capture to the accepted meeting/session generation. Capture starts before STT and recording are ready today; rejected pre-start frames must not establish the meeting’s zero. Late frames from a retired capture cannot enter a resumed session.
3. Implement a low-rate, main-originated probe:
   - Main records send time.
   - Renderer forwards the nonce to the worklet.
   - Worklet samples its processed-audio frontier and replies.
   - Main records reply receipt.

   That frontier’s observation is bracketed by two timestamps from the **same main clock**. Do not assume symmetric IPC delay or subtract renderer timestamps from main timestamps.

4. Maintain a bounded ordered history of these anchors and the resampler’s source-to-output position correspondence. For an endpoint between valid anchors, use the enclosing main-time bounds, including render-quantum/sample-position uncertainty. Do not extrapolate outside supported anchors.
5. Initial policy: probe every **250 ms** while capture is active, at most one outstanding probe, **2-second timeout**, **30-second metadata retention**, and reject derived intervals wider than **1 second**. Keep these named constants with boundary tests.
6. Validate sequence, positions, channels, generation, and frame alignment. Missing or bad timing metadata makes calibration unavailable; it must not fabricate precision. Reject stale-session audio outright. A genuine capture discontinuity invalidates mapping and pending evidence.
7. Invalidate on pause/resume, STT reset, capture stop/loss/suspension, renderer loss, and discontinuity. Reconnect requires new valid anchors; never map replayed PCM using its later STT delivery time. Unsupported pre-reset endpoints remain uncalibrated.
8. Attach the valid interval corresponding to the completed turn’s actual `endMs`. Preserve endpoint association when fragments overlap or arrive out of order; the most recently received fragment is not necessarily the latest audio endpoint.
9. Extend existing latency records with validity/reason, interval width, and speech-end-to-readable lower/upper bounds. A midpoint may be reported only alongside its uncertainty. Preserve missing values as missing, including endpoints outside retained history.
10. Keep evidence allowlisted and bounded. No PCM, transcript text, speaker names, or per-chunk logging. Do not alter endpointing, grace, fallback, classifier policy, or visibility semantics.

### Tests

- Known WAV endpoint falls within the reported main-time interval.
- Independent renderer/main clock origins do not affect correctness.
- Asymmetric IPC delay, delayed worklet delivery, chunk jitter, and timer stalls widen bounds rather than produce falsely precise estimates.
- Mono/stereo and non-16-kHz source resampling preserve exact output-position accounting.
- Pre-start dropped frames, resume offsets, duplicate/out-of-order envelopes, and stale capture generations.
- Missing probes, oversized intervals, history expiry, and capture suspension produce explicit unavailable evidence.
- Reconnect invalidates mapping; replay preserves original audio positions without clock/recording double-counting.
- Latest audio endpoint remains correctly associated under overlapping finals.
- Only valid mappings produce calibrated durations; the audio-cursor proxy remains separate.
- Summary denominators distinguish valid, unavailable, failed, discarded, and delivered runs.
- Observer failures cannot affect capture or answering.

### Fast-gate verification

Run:

- `npm run gate`
- `npm test -- src/renderer/src/audio src/main/ipc/audio src/main/services/meetings/capture/timing src/main/services/turns/turn-assembler-timing.test.ts src/main/services/meetings/assist/latency src/main/diagnostics/rehearsal/audio/wav.test.ts scripts/rehearsal/trials/summarize.test.ts`
- Affected capture-start, meeting-lifecycle, and preview tests.
- `npm run build`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/rehearsal/run.ps1 -Scenario mock-interview -Tier scripted -Assistant canned`

Use generated PCM/WAV fixtures and simulated transport delays. Do not select the real audio tier or Claude.

### Docs

- `docs/ARCHITECTURE.md`: capture/main interval mapping, validity, and derived latency fields.
- `docs/GOTCHAS.md`: replace unconditional calibration-unavailable wording with the precise validity contract.
- `docs/DECISIONS.md`: conservative brackets instead of inferred one-way transport delay.
- `docs/REHEARSAL.md`: synthetic capture evidence, uncertainty, and summary denominators.
- `docs/FEATURES.md`: improved diagnostic timing, with no product latency promise.
- `STRUCTURE.md`: audio IPC grouping and capture timing owners.

Keep `docs/plans/answer-latency-round2.md` historical; its old flat paths are superseded by the current tree.

### Risks, assumptions, and size

The measurable reference is the **AudioWorklet capture graph**, not physical sound at the microphone. Browser/device input latency and STT endpoint accuracy are separate uncertainties; do not claim a bounded mouth-to-screen measurement without evidence for them.

Conservative bounds may exclude samples during stalls or long replay delays. Missing measurements are preferable to fabricated precision.

**Estimate: large, 4–6 engineering days.**

---

## 6. Dependencies, overlap, and implementation dispatches

### Shared boundaries

| Intersection                     | Required coordination                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Replay + identity                | Reset identity before replacement-socket transcripts arrive. Buffered audio does not establish voice continuity.                       |
| Replay + calibration             | Count capture once. Replay uses original positions and never refreshes capture timing from STT receipt.                                |
| Identity + coaching coverage     | Retain historical confirmed evidence; retract actual corrections; exclude uncertain new speech.                                        |
| Identity + duplicate suppression | Connection reset invalidates unfinished candidates without allowing stale callbacks to release newer reservations.                     |
| Duplicate suppression + coverage | Both touch `LiveSession` and request snapshots. Keep answer ownership and spoken-point evidence separate. Coverage remains coach-only. |
| Duplicate suppression + latency  | New terminal duplicate outcomes must finish existing candidate evidence exactly once.                                                  |
| All lifecycle changes            | `meetings/index.ts` remains orchestration. Policy belongs in the specified modules.                                                    |

### Recommended build order

1. **Dispatch 1: reconnect continuity — dk-0af7b509 + dk-5c5a3066.**  
   Implement speaker mapping and replay independently, then integrate reset ordering. Finish with one fake-socket scenario covering pin, outage, buffered audio, reconnect, re-pin, historical-row preservation, and single-count recording.

2. **Dispatch 2: assistance memory — dk-a14215be + dk-1a596f08.**  
   Extract Answer now first, implement cross-lane ownership, then add coach evidence to the settled snapshot contract. Verify that coverage changes neither answer prompts nor speculative equality.

3. **Dispatch 3: calibrated evidence — dk-100a86c3.**  
   Build against the final ingress/reset behavior. Test calibration jointly with replay and identity invalidation, then run the scripted/canned rehearsal.

### Completion rules

For each dispatch, claim items through `dk`, record settled implementation facts through commands, release claims when finished, and run `dk check` before any push. Open notes remain discussion until agreed with the owner.

Respect the approximately 800-line file cap and folder breadth throughout; split new test matrices into responsibility subfolders where needed. Update `STRUCTURE.md` Layout with every extraction.

No builds, tests, provider calls, or repository writes were performed during this planning pass.
