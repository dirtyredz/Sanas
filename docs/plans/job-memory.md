## 1. Goal

Implement dk-664193d9: owner-reviewed job memory capped at 3,000 characters, relevant same-job transcript/summary retrieval for live answers, and a Notes + memory + glossary size meter. Preserve immutable meeting grounding, strict speculative-request equality, and existing answer policies; measure retrieval against an explicit latency budget.

## 2. Placement

Paths below are relative to the repository root. Colocate new tests with their modules; extend existing assistance tests without adding files to `meetings/assist/`.

| Files                                                                                                                        | Responsibility and placement                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/jobs/memory.ts`                                                                                                  | Memory/proposal IPC contracts and the shared 3,000-character limit. Keep memory separate from `Job.notes` and application-import fields.                                                                           |
| `src/main/db/repos/job/memory/schema.ts`, `approved.ts`, `proposals.ts`                                                      | Approved memory, revisions, proposal persistence, source fingerprints and transactional approval. Nested under job ownership to avoid increasing loose repository fan-out.                                         |
| `src/main/services/jobs/memory/generate.ts`, `prompts.ts`, `review.ts`                                                       | Provider-driven rewrites, dedicated evidence-only instructions, validation and review orchestration.                                                                                                               |
| `src/main/ipc/jobs/memory.ts`, existing `src/main/ipc/index.ts`                                                              | Validated memory read/save/approve/dismiss/retry endpoints and registration.                                                                                                                                       |
| `src/shared/ipc.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`                                                        | Typed channels and bridge methods.                                                                                                                                                                                 |
| `src/main/services/meetings/summary/summarize.ts`                                                                            | Enqueue proposal generation after successful summary persistence; keep summary completion independent of proposal success.                                                                                         |
| `src/main/services/assistant/answer-context/job-memory.ts`, existing `assistant/prompts.ts`                                  | Escaped, bounded approved-memory framing; optional explicit memory input to the pure system-prompt builder.                                                                                                        |
| Existing `meetings/assist/meeting-prompts.ts`                                                                                | Read approved memory once at Start and include it in saved grounding.                                                                                                                                              |
| `src/main/db/repos/history/transcripts.ts`, `summaries.ts`, `summary-schema.ts`                                              | Extract reusable transcript search SQL from `repos/segments.ts`; add summary/action-item FTS and lightweight retrieval projections. Query functions accept a database connection so main and the worker share SQL. |
| Existing `src/main/db/repos/segments.ts`, `src/main/db/migrations.ts`                                                        | Preserve current repository exports through delegates; append migrations after v13.                                                                                                                                |
| `src/main/services/history/retrieval.ts`, `excerpts.ts`, existing `history/index.ts`                                         | Extract retrieval and rendering from the current mixed facade. Preserve Search/Ask behavior while introducing explicit live retrieval limits.                                                                      |
| `src/main/services/history/live/policy.ts`, `session.ts`, `worker-client.ts`, `worker.ts`, `protocol.ts`                     | Specificity/query policy, per-candidate evidence freezing, bounded worker requests, read-only execution and main-only message contracts. This is the home for new live retrieval code.                             |
| Existing `meetings/assist/live-session.ts`, `live-assistance.ts`, `suggestion-requests.ts`                                   | Inject retrieval, coordinate its short deadline, and pass frozen evidence to answer builders. Keep the builders pure.                                                                                              |
| Existing `meetings/assist/diagnostics.ts`, `latency.ts`, `latency-summary.ts`                                                | Redacted retrieval timing/status and correlation with existing answer latency. Do not place timing metadata on comparable suggestion requests.                                                                     |
| `electron.vite.config.ts`, `src/main/lifecycle/start.ts`, `src/main/rehearsal/run.ts`                                        | Bundle the worker and dispose it during normal/rehearsal shutdown. Smoke must not start it.                                                                                                                        |
| `src/renderer/src/app/jobs/memory/JobMemory.tsx`, `useJobMemory.ts`, `ContextSizeMeter.tsx`, `context-size.ts`               | Independent saved-memory editor, proposal review state, and size calculation/display.                                                                                                                              |
| Existing `app/jobs/JobOverview.tsx`, `app/pages/JobDetail.tsx`, `app/styles/pages.css`                                       | Mount the separate memory section and meter, preserve dirty drafts, and use existing library styling.                                                                                                              |
| `src/renderer/src/dev/memory/mock-memory.ts`, existing `dev/mock-api.ts`                                                     | Browser-preview memory states and bridge composition.                                                                                                                                                              |
| Existing `db/repos/job/job-deletion.ts`, `shared/jobs/deletion.ts`, `app/jobs/deletion/deletion-copy.ts`, `dev/mock-jobs.ts` | Include memory/proposals in deletion counts and confirmation.                                                                                                                                                      |
| `src/main/rehearsal/runner/history-latency.ts`, `scripts/rehearsal/trials/history-latency.ps1`, `history-latency.mjs`        | Isolated corpus fixtures and matched retrieval-off/on measurements, following existing owner-tool conventions.                                                                                                     |

Keep every code file below approximately 800 lines. `live-assistance.ts` is already about 730 lines: new retrieval orchestration belongs in `history/live/session.ts`. Do not expand `meetings/assist/` or fold the broader dk-c0cd0363 reorganization into this feature.

## 3. Sequence

1. **Add revisioned memory storage and review semantics.**
   - Approved memory stores text, revision and update time; absence means empty memory.
   - Store one proposal record per source meeting, including source job, summary/action-item fingerprint, approved-memory base revision, generation identity, proposed text and disposition.
   - Multiple meetings retain separate proposals. A later completion cannot overwrite another meeting’s unreviewed update.
   - Approval atomically checks proposal identity, source validity and base revision, saves the owner-edited replacement, increments the memory revision and marks that source reviewed.
   - Direct Save memory supports editing and clearing, uses an expected revision, and invalidates outdated proposals.
   - Dismissal records the reviewed source fingerprint so opening the page does not immediately recreate it.
   - Enforce the cap in main and storage. Reject oversized generated text rather than silently cutting a commitment or number.

2. **Generate proposed rewrites after summaries.**
   - Hook the shared `summarizeLines` success path used by Stop and explicit summary regeneration.
   - Generate through `AssistantProvider` using the configured answer model, a bounded timeout and a dedicated prompt. Input is approved memory plus the source meeting’s dated summary/action items; neither other pending proposals nor generated suggestions are facts.
   - Require a complete replacement: merge, deduplicate, preserve uncertainty, retain decisions/open items/owners/numbers, and remove stale facts only when the source supports that change.
   - Bound source input to 24,000 characters, preserving summary and action-item sections separately and declaring truncation. Do not infer that an omitted item was resolved.
   - Serialize generation per job. Before publication, recheck the source fingerprint, job ownership, memory revision and generation identity.
   - Generate only for ended, non-practice meetings belonging to an ordinary job. Missing keys, skipped summaries and provider failures leave approved memory untouched and expose retryable status.
   - Use counted post-processing protection while generation may write. Launch it independently so failure cannot suppress `MeetingUpdated`, successful summary return or auto-email.
   - Pending proposals based on an older approved revision must be regenerated before approval. Review oldest first, showing the remaining count.

3. **Build the owner review and context meter.**
   - Show saved memory separately from Notes, with its own Save memory action and character counter.
   - Show current versus proposed text, source meeting/date, an editable proposal, Approve and Dismiss. Preserve edits on provider failure or stale-save rejection; offer reload/regenerate explicitly.
   - Refresh proposal status when the job page becomes visible and while generation is pending. Late replies must not replace another job’s state or a dirty draft.
   - Include memory drafts in `JobDetail`’s unsaved-change handling.
   - Meter Notes + approved memory + rendered glossary terms/notes. Show characters and approximate tokens (`ceil(chars / 4)`); warn above 12,000 characters.
   - Preview unsaved Notes separately from the saved total. Pending memory is not counted as active context. Explain that this subtotal excludes other prompt fields.
   - Update deletion preview counts and browser mocks.

4. **Freeze approved memory into meeting grounding.**
   - Extend `buildSystemPrompt` with an optional explicit approved-memory argument; it must not access repositories.
   - `MeetingPrompts.begin` reads approved memory once and saves the rendered result in the existing grounding row.
   - Frame it as owner-approved historical job context, with embedded instructions treated as data. It is not automatically candidate biography or evidence of what was said in the current meeting.
   - Approval during a live/paused meeting affects future meetings only. Context Apply must not reread memory.
   - Audit other builder callers: summary regeneration and the comparison harness keep explicit behavior. Memory rewrite generation uses its dedicated prompt, never the live system prompt as evidence.
   - No provider cache-layout change is required: approved memory resides in the existing cached system block.

5. **Extract history retrieval and add summary search.**
   - Keep `ftsAnyOf`/`ftsAllOf` as the only FTS-expression constructors.
   - Extract transcript SQL and excerpt construction while retaining existing Search/Ask exports, limits and citation behavior.
   - Add external-content FTS over meeting summary/action items, with migration backfill and insert/update/delete triggers.
   - Live queries require a concrete job ID and exclude the current meeting, unended meetings and practice sessions. Scope through current meeting ownership, not copied job metadata.
   - Use lightweight projections; do not load full meeting rows or whole transcripts for each hit.
   - Fetch bounded candidates from both indexes, interleave their ranked results deterministically rather than comparing unrelated raw BM25 scores, and deduplicate overlapping evidence.
   - Render at most three snippets, at most 800 characters each and 2,400 characters total **including labels and framing**. Include title/date and transcript time where applicable; label generated summaries explicitly.
   - Existing Ask rendering intentionally allows its first matched line to exceed its budget. Preserve that compatibility policy; live rendering must have a strict cap.
   - Use temporal neighbors for live transcript excerpts. Existing segment-ID adjacency is unreliable after merges.

6. **Add bounded worker retrieval to live answers.**
   - Start one read-only SQLite worker lazily for a qualifying meeting, after migrations. Pass the actual open database path; do not initialize Electron, settings or migrations in the worker.
   - Reuse extracted repository queries with the worker’s connection. Keep a bounded queue and discard obsolete candidate requests. Worker startup, lock contention, failure or overload must degrade to empty evidence.
   - **Automatic answers:** query only when the completed turn contains a specific subject. Use deterministic glossary matches, technical identifiers/acronyms/numbers, or at least two non-generic content terms. Cap query terms and test generic conversational negatives. No LLM query rewriting.
   - Begin retrieval alongside classification. Allow at most **10 ms** before freezing a hit, miss or failure and starting eligible speculation. Classification does not wait for retrieval.
   - If classification rejects first, cancel retrieval and do not start speculation. If it accepts first, generation waits only for the remainder of that same 10 ms budget.
   - Freeze the exact evidence once per candidate and reuse it for speculative, promoted, fallback and reference answers. Late results never change that request.
   - **Answer now:** use the existing latest-question anchor; if absent, derive a bounded query from the newest transcript text. Permit at most **25 ms**, then answer without retrieval. Recheck meeting identity, epoch and requested-lane availability after waiting; coalesce repeated pending hotkeys.
   - Append evidence only through `automaticAnswerRequest` and `answerNowRequest`. Keep classifiers, Next point, typed, screen and audience retrieval behavior unchanged.
   - Preserve full request equality. Other changes—new speech, told stories, context or carried questions—must still cause legitimate speculative fallback.
   - Invalidate pending work on pause, Stop, reconnect, identity change and meeting replacement. Terminate the worker on shutdown; discard late callbacks.
   - Do not add a cross-candidate result cache initially. This avoids stale evidence after refiling, deletion or summary changes.

7. **Preserve replay, source validity and latency evidence.**
   - The runner already saves `userContent` as `promptWindow`; More detail therefore replays the exact historical snippets without another search.
   - Validate pending proposal sources before showing them as approvable and again transactionally on approval. Refiles, deletes, merges and regenerated summaries invalidate stale proposals.
   - Approved memory remains owner-controlled when source meetings change; never silently erase it.
   - Record retrieval status, queue/query/wait durations, snippet count and character count, correlated to candidate/manual-action identity. Never log terms, snippets or memory.
   - Keep worker queries in short read transactions. Timeouts discard results; repeated stalls recycle the worker without delaying answers.

## 4. Tests

- **Memory repositories:** migrations from v13; exact character boundaries; revision conflicts; approve/edit/clear/dismiss; multiple pending meetings; duplicate source fingerprints; job cascade and deletion counts.
- **Generation service:** full rewrite rather than append; no pending-memory input; out-of-order completions; changed approved revision; regenerated, moved, merged or deleted sources; practice/Unsorted exclusion; missing keys, oversized output and retry.
- **Summary integration:** proposal failure does not fail summarization or suppress existing completion/email behavior; background holds release on every terminal path.
- **Renderer:** saved versus proposed state, edited approval, stale-save preservation, job-switch races, dirty-state handling, meter boundaries and exclusion of pending text.
- **History repositories/rendering:** real SQLite FTS backfill and triggers; cross-job isolation; current/unended/practice exclusions; hostile query punctuation; summary-only hits; merged transcript ordering; deduplication and strict caps with oversized lines/titles.
- **Worker/session:** injected clock and worker tests for 10/25 ms deadlines, cold startup, overload, late results, worker failure, cancellation and shutdown.
- **Existing assistance suites:** identical evidence through speculation/promotion; late hits cannot force replacement; fast classifier rejection starts no answer; genuine request differences still reject promotion; repeated Answer now; lifecycle invalidation.
- **Grounding/replay:** approved-only memory, unchanged active system prompt after approval, snippets only in user content, and More detail unchanged after source deletion or later memory edits.

Use the existing Node SQLite test adapter for repository tests. Add packaged worker/native checks separately.

## 5. Verification

The implementer must run:

- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run format:check`
- `npm run build`
- `npm run dist`, followed by the documented packaged smoke procedure
- `dk check` before pushing

Run the new isolated history-latency harness with warm/cold workers and synthetic corpora of 10,000, 100,000 and 1,000,000 segments, including common-term worst cases and summaries. Measure p50/p95/p99 query time, deadline misses, event-loop delay and provider-dispatch delay.

Acceptance budgets:

- Main-thread retrieval bookkeeping/formatting: p95 ≤2 ms.
- Added automatic provider-dispatch delay: p95 ≤10 ms, p99 ≤20 ms.
- Answer now retrieval wait: ≤25 ms, excluding separately reported event-loop scheduling delay.
- No speculative promotion loss caused solely by late retrieval.
- Known-specific warm queries must return useful fixtures reliably; always timing out is not successful retrieval.

Use matched retrieval-off/on provider trials with the same model, profile and corpus. Report first-readable distributions, cache usage and miss rate; target no more than 50 ms p95 first-readable regression. Canned runs establish wiring and local overhead, not provider latency or answer quality. Do not change Full, endpointing, grace or model budgets to meet these targets.

In an isolated running app, confirm proposal review survives restart, approval affects only new meetings, a summary-only historical fact reaches Answer now, unrelated jobs never contribute evidence, and More detail retains its original evidence.

No build, test or performance result is claimed by this plan.

## 6. Docs

- **`STRUCTURE.md`:** Add the memory, history repository and worker homes; document extraction boundaries without growing `meetings/assist/`.
- **`docs/ARCHITECTURE.md`:** Describe proposal lifecycle, summary FTS, worker ownership, frozen memory/evidence and replay.
- **`docs/DECISIONS.md`:** Record owner-approved replacement semantics, separate proposals, next-meeting activation, latency deadlines and approved-memory retention after source deletion.
- **`docs/FEATURES.md`:** Explain review actions, retrieval eligibility, context meter and failure/retry behavior.
- **`docs/GOTCHAS.md`:** Document stale proposal checks, synchronous-SQL timeout limitations, speculative evidence freezing and worker packaging.
- **`docs/REHEARSAL.md`:** Document the corpus benchmark, latency budgets and distinction between canned and real-provider evidence.

## 7. Open questions / assumptions

- `dk show dk-664193d9 --json` returned `DOCKET_NOT_A_REPO`. This plan uses the matching `docs/items/dk-664193d9.md` body as a read-only fallback. The implementer must verify it through Docket before claiming or updating the item.
- “After each meeting” means after a successful summary for an ended ordinary-job meeting. Short meetings or missing credentials expose unavailable/retry status; there is no automatic historical backfill.
- Multiple pending meetings receive separate proposals. Approving one makes other base revisions stale and requires regeneration. This adds review steps but prevents unapproved updates becoming trusted input or disappearing.
- Unsorted and practice sessions do not create job memory or supply historical evidence. Ordinary saved job context remains available to practice through existing grounding behavior.
- The 12,000-character meter warning and 10/25 ms retrieval deadlines are proposed defaults, subject to measured acceptance.
- The worker adds packaging and lifecycle complexity deliberately: a synchronous FTS query cannot be interrupted by a JavaScript timeout. Deadline misses sacrifice historical context for answer responsiveness.
- Current code uses one frozen system prompt and 150 ms turn grace. Older decision entries describing two prompt variants or 350 ms grace are historical; follow current code and November rulings.
