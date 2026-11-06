## 1. Goal

Reduce automatic speech-end-to-first-text latency toward a live median **≤2.5 seconds**, with request/room answers using the same overlapping classifier-and-answer path as question-me answers. Add redacted stage evidence, tolerate unambiguous classifier formatting, recover stalled Deepgram connections, and preserve recording-aligned timestamps after reconnect.

Keep fail-closed admission, exact prompt-equivalence checks, grounding, cancellation, and existing manual-answer behavior.

## 2. Placement

Paths below are relative to the repository root.

| Files                                                                                                                                                                   | Responsibility and placement                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New:** `src/main/services/assistant/classifier-verdict.ts` and `.test.ts`                                                                                             | Pure verdict parsing, canonical formatting, and malformed-output shape sanitization. Extract these from `classifier.ts`; provider deadlines remain there.                           |
| `src/main/services/assistant/classifier.ts`, `types.ts`, `claude.ts`; **new:** `provider-usage.ts` and `.test.ts`                                                       | Classifier outcome instrumentation and optional provider-neutral usage callback. SDK usage extraction belongs inside the provider boundary. Preserve `complete(): Promise<string>`. |
| **New:** `src/main/services/assistant/answer-context/automatic-turn.ts` and `.test.ts`; change `assistant/prompts.ts`                                                   | Extract automatic turn-focus rendering and carried-question formatting from the mixed prompt module. Own the neutral automatic wording here.                                        |
| `src/main/services/meetings/assist/suggestion-requests.ts`, `speculative-answer.ts`, `live-assistance.ts`                                                               | Build and promote the neutral request; retain classifier-owned admission and strict `samePrompt`.                                                                                   |
| **New:** `src/main/services/meetings/assist/latency.ts` and `.test.ts`                                                                                                  | Typed, bounded, metadata-only stage records, correlation, and main-log output. Keep evidence assembly out of the 669-line `live-assistance.ts`.                                     |
| `src/main/services/meetings/assist/diagnostics.ts`, `run-observation.ts`, `suggestion-runner.ts`, `live-session.ts`                                                     | Emit source timestamps and connect classifier, speculative, ordinary, and manual runs to latency records. Existing text-bearing events must never be serialized wholesale.          |
| `src/main/services/turns/types.ts`, `turn-assembler.ts`; `src/main/services/meetings/index.ts`                                                                          | Assembly timing evidence and ingress/audio-clock samples. Preserve pure assembly and existing completion policy.                                                                    |
| **New:** `src/main/services/stt/deepgram-session.ts`, `deepgram-watchdog.ts`, `deepgram-stream-url.ts`, with adjacent tests; change `deepgram.ts`, `deepgram-events.ts` | Extract socket lifecycle from the provider/batch module. Separate watchdog policy and URL construction; avoid circular imports.                                                     |
| `src/main/rehearsal/outcomes/providers.ts`, `outcomes.ts`; `runner/evidence.ts`, `report.ts`                                                                            | Canonical classifier evidence, usage capture, and bounded latency records in rehearsal output.                                                                                      |
| `src/main/services/mock-interview/evidence.ts`, `report.ts`, `turns/session.ts`                                                                                         | Collect the same metadata in Mock evidence and emit a bounded diagnostic summary. Preserve existing user-facing results and metric meanings.                                        |
| `scripts/eval/topic-switch.eval.ts`                                                                                                                                     | Update only the current-version automatic request caller if its signature changes; preserve the historical-version adapter.                                                         |

Update affected adjacent tests, including `prompts.test.ts` and `db/repos/meeting/meeting-grounding.test.ts` if the extracted focus type changes. Split new test matrices into dedicated files rather than growing existing files beyond approximately 800 lines.

No database migration or new renderer IPC is needed. The deliberate tradeoff is that detailed Mock diagnostics remain in main-process evidence/logs rather than adding a diagnostics UI.

## 3. Sequence

1. **Establish work tracking and reproductions.**  
   The implementer runs `docket guide` before the first item write, reads `dk-98a73491` through `dk show --json`, finds related work through filtered lists, and claims work in the current worktree. Treat open notes as discussion requiring owner resolution. Add the parser, reconnect-clock, and six-verdict regression tests before changing behavior.

2. **Add the stage-record contract and provider usage.**
   - Correlate by meeting/session generation, candidate ID, classifier attempt ID, and answer run ID. A fallback answer gets its own run ID linked to the original candidate and discarded speculation.
   - Keep correlation outside prompt-bearing `SuggestionRequest` fields so instrumentation does not require weakening `samePrompt`.
   - Stamp events at their source using an injectable monotonic clock. Record audio positions separately, with paired audio/monotonic samples where needed.
   - Record classifier start/end, canonical verdict or failure category, request start, first provider text, promotion, first content broadcast, terminal outcome, and speculation discard reason. Manual runs mark classification as not applicable.
   - Distinguish first provider text from first broadcast containing readable content. Empty start events, `<none>`, and Markdown delimiters alone do not satisfy the first-text benchmark. Main broadcast remains a proxy for visibility, not renderer paint.
   - Add optional usage reporting to `AssistRequest`. `claude.ts` reports input, output, cache-read, and cache-write counts from SDK usage; capture available partial usage on cancellation and mark it partial. Missing usage is unknown, never zero. Do not add token-count API requests.
   - Preserve separate provider fields and document any derived total; do not double-count cache usage.
   - Callbacks are best effort and cannot fail generation.

   Emit only allowlisted numeric fields, IDs, enums, and bounded version identifiers. Never emit prompts, transcript/answer text, speaker names, raw provider output, or exception bodies. Use fixed-size records and capped retention, with an overflow counter. Avoid synchronous logging on every delta/audio chunk.

   The existing logger redacts object keys containing `token`; use safe numeric field names such as `inputCount` and `cacheReadCount`, and test their actual logged representation without weakening secret redaction.

3. **Measure the unexplained turn-close delay without changing timing policy.**
   - Capture socket message ingress before synchronous final persistence, final receipt, advancing activity receipt, boundary source/time, boundary disposition, cancellation of pending completion, scheduled deadline, actual timer firing, and completion reason.
   - Retain a bounded per-turn summary and counters rather than an unlimited interim-event history.
   - Derive ingress-to-assembly delay, accepted-boundary-to-completion delay, and timer lateness. Record the audio-cursor gap as an explicitly labelled proxy; never subtract raw audio timestamps from monotonic timestamps.

   Code inspection identifies plausible paths, not the cause in the owner’s meetings:
   - Endpoint completion nominally takes `600 + 150 ms`.
   - `UtteranceEnd` is configured at 1,000 ms, naturally producing roughly **1.15 seconds** before transport/scheduling overhead.
   - Fallback closes **1,800 ms after the last advancing receipt**, not after acoustic speech end.
   - New activity can invalidate a boundary; stale boundaries are rejected.
   - Final persistence and processing occur before delivery of the same message’s boundary.
   - Timer rescheduling uses the remaining deadline; it does not inherently restart another 150 ms grace.

   Leave endpointing, grace, fallback, cooldown, and classifier spacing unchanged in this batch.

4. **Implement tolerant, conservative verdict parsing.**
   - Bound input length, case-fold, and recognize whole-word enum tokens across punctuation and whitespace.
   - Accept one unambiguous kind and one addressee in either order, including surrounding non-conflicting wording: `Verdict: ROOM, QUESTION.` becomes `question room`.
   - Accept unambiguous `none`.
   - Reject competing kinds/addressees, mixed `none` and positive verdicts, incomplete pairs, substring matches, and negated, alternative, or uncertain verdict statements. Do not select the first matching pair from conflicting prose.
   - Keep the classifier’s concise output instruction, deadline, cancellation, and suspension policy unchanged.
   - Malformed diagnostics contain only capped enum-token counts/order, length bucket, punctuation/case flags, and rejection category.

   **Update the rehearsal caller:** `outcomes/providers.ts` currently stores `answer.trim()` when parsing succeeds. Replace that with canonical parsed enums; tolerant parsing must not cause surrounding provider prose to enter evidence.

5. **Use one neutral speculative prompt for all six normal accepted verdicts.**
   - Remove `SPECULATED_VERDICT`.
   - Build one automatic prompt before classification, then rebuild the ordinary request after acceptance through the same builder.
   - The prompt names the completed turn and asks for the appropriate response to its information request, requested action, or objection. It does not assert a classifier kind or “put to Me.”
   - Preserve conditional room guidance: for an open-floor/group invitation, offer only a useful, unrepeated contribution; otherwise return `<none>`.
   - Preserve current-exchange anchoring, background limits, carried-question order, told stories, grounding, output contract, and budgets.
   - Promote only when the existing full `samePrompt` check succeeds. Changed context, transcript window, ledger, grounding, model, budget, or provenance still requires discard and ordinary regeneration.
   - Preserve the explicit reference-answer prompt for `other` when Answer every question is enabled. That path deliberately falls back to ordinary generation; normal `other` verdicts remain rejected.
   - Preserve unpublished buffering, cancellation, lane ownership, holds, and cooldown/ledger consumption only upon admission.

   **Recommendation and tradeoff:** one neutral request preserves the current one-speculation cost ceiling and eliminates verdict-only replacement calls for request/room. Six variants multiply speculative spend; a follow-up instruction cannot retroactively make held text satisfy a different prompt. The neutral approach asks the generator to infer direct-versus-room semantics from context, so quality needs owner observation. It explicitly supersedes the 2026-11-04 question-me-only decision.

6. **Fix the Deepgram clock and add a nine-second result watchdog.**
   - Count every PCM byte received by `sendAudio`, including chunks dropped during reconnect, anchored to `startOffsetMs`. Use the existing 16 kHz, 16-bit, channel-aware conversion without per-chunk rounding.
   - Freeze each socket’s timestamp offset at the start of its first successfully transmitted PCM chunk. Do not anchor to the last final, disconnect time, socket-open time, or wall clock.
   - Apply that offset consistently to finals, interims, endpoint, utterance-end, and VAD timestamps. Update the misleading `finalEndMs` reconnect-offset comment.
   - Arm the watchdog after PCM transmission begins. Valid `Results`, including empty results, refresh progress; metadata, keepalives, and malformed messages do not.
   - Define continuing flow using a rolling PCM-send window; require recent sends and approximately nine seconds without results. Capture inactivity resets the flow window so resumption does not immediately trigger recovery.
   - On expiry, retire the socket synchronously, clear its timers, emit exactly one reset, close it, and enter the existing bounded reconnect backoff. Late callbacks and the resulting close event cannot start a second recovery.
   - Bound connection opening and guard socket installation after Stop. Stop during backoff or pending open must clear timers and prevent resurrection.

   This preserves the existing STT seam: the meeting already sends the same accepted PCM that advances its recording clock, including during internal reconnect. No audio replay or recovery of lost transcript text is introduced.

7. **Wire evidence consumers and finish the fast gate.**
   - Rehearsal and Mock consume the same sanitized records.
   - Keep discarded speculation and usage in diagnostic totals even when excluded from delivered-answer reports.
   - Report started/promoted/discarded counts, discard categories, fallback counts, missing usage, classifier outcomes, and latency grouped by verdict and completion path.
   - Run the verification below, update living docs, close the parser item only after its regression passes, and release claimed work. Run `dk check` before any later push.

## 4. Tests

- **Parser:** reversed `room question` first; all kind/addressee pairs, uppercase, punctuation, whitespace, surrounding labels, canonical `none`; conflicting, negated, uncertain, oversized, incomplete, and substring outputs fail closed.
- **Privacy and usage:** malicious surrounding text never appears in logs/reports; SDK usage survives serialization; cumulative usage is not counted twice; missing/partial usage is labelled; observer failures do not affect generation; bounds and overflow counts work.
- **Speculation:** six-verdict promotion matrix with classifier-first and answer-first ordering. Exactly one answer request when prompt inputs remain identical; no publication before acceptance. Retain changed-prompt fallback, no-op, timeout, Stop/reset, late callback, lane/hold, cooldown, and ledger tests. Cover `other` override explicitly.
- **Timing:** injected delays produce assembly time plus `max(classifier duration, answer first-text duration)` for all six verdicts. Manual runs bypass classification. Discarded and failed attempts remain represented.
- **Turn assembly:** endpoint, utterance-end, fallback, stale boundary, advancing activity cancellation, repeated rescheduling, and delayed timer firing produce accurate evidence without changing turn contents or completion policy.
- **Fake socket:** nine-second stall, healthy empty/interim results, no audio, resumed flow, mono/stereo byte clocks, long silence before the last final, dropped audio during backoff, delayed first post-open chunk, multiple reconnects, resumed start offset, old socket events, single reset, Stop during open/backoff, open timeout, and retry exhaustion.

Replace the existing reconnect test that expects the new connection to start at the last final’s 500 ms with PCM-driven recording-clock assertions.

## 5. Verification

The implementer must run:

- `npm run typecheck` — covers both tsconfigs.
- `npm run lint`.
- Targeted Vitest files for the changed parser, provider, prompts, speculation, runner, turn assembly, Deepgram, rehearsal evidence, and Mock evidence.
- `npm run build`.
- One free rehearsal:  
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/rehearsal/run.ps1 -Scenario mock-interview -Tier scripted -Assistant canned`

Confirm the rehearsal retains existing assertions, emits bounded redacted stage evidence, and records discarded work without creating visible speculative cards. No paid eval, microphone session, packaging, or broad test sweep belongs to this fast gate.

For subsequent owner live acceptance, report automatic speech-end-to-first-readable-text median **≤2.5 seconds**, plus per-verdict counts and medians demonstrating request/room parity. Separate failures, no-ops, discarded attempts, and unmatched measurements rather than averaging them away. Confirm reconnect timestamps align with playback and observe watchdog behavior during long silence. Canned results cannot establish live latency or answer quality.

This planning pass performed read-only inspection; no build or tests were run.

## 6. Docs

- `docs/ARCHITECTURE.md`: neutral speculation, stage schema, usage reporting, clock mapping, watchdog, and separate endpoint/utterance-end/fallback latency paths.
- `docs/DECISIONS.md`: explicitly supersede question-me-only speculation; record the single-request cost and audience-inference tradeoff.
- `docs/GOTCHAS.md`: reconnect offsets follow PCM, clocks have different origins, tolerant parsing requires canonical evidence, and missing usage is not zero.
- `docs/FEATURES.md`: broader automatic speculative reuse and stalled-STT recovery.
- `docs/REHEARSAL.md`: timing fields, denominators, redaction, fast-gate command, and synthetic-versus-live limitations.
- `STRUCTURE.md`: new responsibility owners and extractions.

The historical diagnosis predates shipped speculation and the 150 ms grace; retain it as historical evidence. The architecture’s approximately 1.9-second statement needs qualification against the owner’s newer measurements.

## 7. Open questions / assumptions

- The six required verdicts are question/request/objection × me/room. Speculative `other` remains outside this batch.
- “Audio flowing” means continuing PCM delivery, including silence. Valid empty results prevent unnecessary recovery; actual provider behavior during sustained silence remains an owner acceptance check.
- The supplied meeting measurements are authoritative brief inputs, not independently reproduced evidence. Concurrent classifier timeouts and the Deepgram stall do not establish a shared cause.
- The neutral prompt’s quality tradeoff is acceptable for implementation under the owner’s chosen core batch. Prompt tests establish wording and safety invariants; live observation must establish answer quality.
- The ≤2.5-second target remains a benchmark to verify. This batch does not promise that broader speculation alone resolves the unexplained turn-close delay.
