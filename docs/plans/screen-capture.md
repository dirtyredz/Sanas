## 1. Goal

Add **Capture screen** during live or paused client/team meetings: one explicit action captures the display under the overlay and asks Sanas to explain it using the meeting’s existing context. For visible code problems, the answer identifies the error, explains the likely cause, and proposes a minimal fix.

The existing Ctrl+Shift+K composer also gains **Attach screen**. Captures accompany saved answers, remain reviewable in meeting history, and supply the original visual evidence to More detail.

## 2. Placement

Paths below are relative to the repository root. Keep screen capture separate from `services/meetings/capture/`, which already owns audio identity and health.

| New or changed files                                                                                                                                                                                                             | Responsibility and placement                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New** `src/main/services/screen-capture/desktop.ts`                                                                                                                                                                            | Electron display selection and one-shot acquisition. No meeting or provider policy.                                                                                                                             |
| **New** `src/main/services/screen-capture/encode.ts`                                                                                                                                                                             | Image sizing, encoding, byte limits, and bounded previews.                                                                                                                                                      |
| **New** `src/main/services/screen-capture/store.ts`                                                                                                                                                                              | Main-owned draft buffers and immutable capture files; safe lookup, deletion, and interrupted-write cleanup.                                                                                                     |
| **New** `src/main/services/meetings/assist/capture-requests.ts`                                                                                                                                                                  | Coordinate acquisition, meeting identity, requested-lane reservation, persistence, and admission. Keep asynchronous preparation out of prompt builders.                                                         |
| **New** `src/main/services/assistant/live-controls/capture-prompts.ts`                                                                                                                                                           | Image interpretation and code-diagnosis instructions.                                                                                                                                                           |
| **New** `src/shared/live-controls/capture.ts`; change `src/shared/live-controls/types.ts`, `src/shared/types.ts`, `src/shared/ipc.ts`, `src/shared/suggestion-label.ts`                                                          | Typed capture requests/results, draft references, saved capture metadata, capture kind, labels, shortcut setting, and retention accounting. Reuse `ManualKind` rather than maintaining another union in labels. |
| **New** `src/main/ipc/screen-capture.ts`, `src/main/ipc/screen-capture-validation.ts`; change `src/main/ipc/index.ts`, `src/main/ipc/live-controls-validation.ts`, `src/preload/index.ts`                                        | Validated capture/preview/discard IPC and optional typed-question attachment. Handlers validate and delegate.                                                                                                   |
| Change `src/main/services/assistant/types.ts`, `src/main/services/assistant/claude.ts`                                                                                                                                           | Provider-neutral optional image input and its Anthropic mapping. SDK imports remain confined to the provider.                                                                                                   |
| Change `src/main/services/meetings/assist/manual-requests.ts`, `live-session.ts`, `suggestion-runner.ts`; `src/main/services/meetings/live-controls.ts`, `index.ts`                                                              | Image-aware admission, reservation, request forwarding, lifecycle cleanup, and successful persistence notifications. `MeetingPrompts.snapshot()` remains synchronous and read-only.                             |
| **New** `src/main/db/repos/screen-captures.ts`, `screen-capture-schema.ts`; change `src/main/db/migrations.ts`, `src/main/db/repos/suggestions.ts`, `suggestion-grounding.ts`                                                    | Capture metadata, schema v8, suggestion attachment links, and immutable detail lookup. All new SQL belongs here.                                                                                                |
| Change `src/main/services/meetings/remove.ts`, `merge/merge.ts`, `merge/merge-plan.ts`, `export.ts`; `src/main/services/retention/index.ts`                                                                                      | File cleanup, explicit merge refusal, export attachment notices, and retention integration.                                                                                                                     |
| **New** `src/shared/hotkeys/types.ts`; relocate contracts from `src/shared/presentation/hotkeys.ts`                                                                                                                              | Global shortcut contracts already cover non-presentation actions; give them an accurate home. Update imports in registration, preload, and Settings.                                                            |
| Change `src/main/services/hotkeys/registration.ts`, `src/main/lifecycle/start.ts`, `src/main/windows/overlay-window.ts`, `src/main/config/settings.ts`, `settings-schema.ts`; `src/renderer/src/app/settings/HotkeysSection.tsx` | Capture shortcut, registration feedback, narrow overlay-bounds accessor, and defaults/validation.                                                                                                               |
| **New** `src/renderer/src/overlay-app/OverlayCaptureAction.tsx`, `useCaptureDraft.ts`; change `OverlayComposer.tsx`, `OverlaySuggestions.tsx`                                                                                    | Direct capture control and attachment lifecycle. Extract attachment state into the hook instead of growing the composer’s mixed responsibilities.                                                               |
| **New** `src/renderer/src/lib/suggestions/CaptureThumbnail.tsx`; change `SuggestionContent.tsx`, `whisper-history.ts` in that directory; `src/renderer/src/app/pages/MeetingView.tsx`                                            | Shared image review, complete diagnosis rendering, metadata propagation, and history refresh.                                                                                                                   |
| Change `src/renderer/overlay.html`, `src/renderer/src/overlay-app/overlay.css`, `src/renderer/src/app/styles/pages.css`, `src/renderer/src/app/settings/RetentionSection.tsx`                                                    | Local image CSP, existing stylesheet homes, and accurate capture-retention copy/accounting.                                                                                                                     |
| **New** `src/renderer/src/dev/mock-screen-capture.ts`; change `mock-api.ts`, `mock-live-controls.ts` in that directory                                                                                                           | Browser-preview capture fixtures and behavior. Keep fixture/state logic out of the already substantial mock bridge.                                                                                             |
| **New** `src/main/diagnostics/screen-capture-checks.ts`, `src/main/db/repos/screen-capture-checks.ts`; change `src/main/diagnostics/smoke.ts`, `scripts/release/smoke.ps1`                                                       | Disposable Electron-ABI migration/repository verification. Diagnostics orchestrates; repository helpers own fixture SQL. Update the wrapper’s hardcoded schema expectation.                                     |

Colocate tests listed below. No inspected production file requires extraction solely for size; keep every changed code file below approximately 800 lines. The deliberate extractions are shortcut contracts and composer attachment state.

## 3. Sequence

1. **Establish contracts and additive provider support.**

   Add `capture` to `ManualKind`. Direct capture has its own action; typed requests remain `kind: 'typed'` with an optional opaque draft token. Successful suggestions carry an optional persisted `captureId`.

   Add optional immutable image input to `AssistRequest`, containing MIME type and encoded bytes/base64 without Anthropic-specific types. Keep `userContent` as text. The Claude provider produces image content followed by the existing text content; text-only requests retain their current shape.

   Update the runner’s forwarding. Classifier, summary, and Ask-your-history callers remain text-only. Images never enter stable system/deck cache blocks.

2. **Implement bounded display capture.**

   Use main-process `desktopCapturer.getSources({ types: ['screen'], ... })`. Select `screen.getDisplayMatching(overlayBounds)` and match its ID to `DesktopCapturerSource.display_id`; never use source ordering or screen names as identity. Electron does not guarantee returned thumbnail dimensions, so validate the actual image. [Electron capture-source contract](https://www.electronjs.org/docs/latest/api/structures/desktop-capturer-source)

   Use existing overlay bounds even when hidden. With no overlay, select the cursor’s display before revealing the overlay. A disappeared or unmatched display produces a retry message rather than silently capturing another monitor.

   Treat bounds as DIP coordinates; apply encoding limits to the returned image’s pixel dimensions. Handle negative monitor origins, mixed scaling, and portrait displays. [Electron screen coordinates](https://www.electronjs.org/docs/latest/api/screen)

   Set these application limits:

   - One image per request.
   - Preserve aspect ratio; never upscale.
   - Maximum long edge **1,568 px**, maximum area **1.15 megapixels**.
   - Prefer PNG for code/text. If over **2 MiB encoded bytes**, try JPEG quality 85, then 75; use a bounded further downscale if necessary, otherwise reject.
   - Thumbnail: maximum long edge **320 px**, maximum **96 KiB**.
   - Acquisition deadline: **five seconds**. Discard late results.

   These conservative limits trade dense-screen fidelity for bounded cost and payload size; they fit below current provider limits. Ask the owner to enlarge the relevant code/error before recapturing when text is too small. [Claude vision guidance](https://platform.claude.com/docs/en/build-with-claude/vision)

   Preserve unconditional overlay content protection. Do not modify the audio-loopback display-media handler.

3. **Add durable capture storage and schema v8.**

   Store only the normalized image sent to the assistant under:

   `%APPDATA%\sanas\captures\meeting-<id>\<generated-name>.png|jpg`

   Resolve the root through `app.getPath('userData')`. Discard original-resolution buffers after encoding. Derive thumbnails from the saved normalized image.

   Add a capture table recording meeting ownership, audio-clock timestamp, wall-clock capture time, display identity, MIME type, dimensions, byte length, and main-generated filename. Add nullable `capture_id` to suggestions; multiple source/detail suggestions may reference one capture.

   **Rebuild `suggestions` in v8:** its existing CHECK constraint excludes `capture`. Preserve all columns, IDs, AUTOINCREMENT high-water mark, grounding relationships, and self-referencing detail links. Keep foreign keys enabled and the migration transactional; do not edit v7.

   Write files atomically before publishing their rows. Remove failed writes where possible; interrupted files and unreferenced rows remain identifiable for cleanup. Capture data never goes into `prompt_window`.

4. **Implement preparation and admission without races.**

   Extend the runner with a narrow requested-lane reservation that is visible through existing in-flight checks. Acquisition is asynchronous: a `canStart()` check alone cannot prevent another requested answer starting while capture awaits.

   Direct capture follows this order:

   - In the lifecycle queue, validate the active/paused meeting and assistant configuration, reserve the requested lane, hold the meeting against removal, and freeze prompt/settings context.
   - Capture and encode outside the lifecycle queue.
   - Re-enter the queue, verify the same meeting remains active, persist the capture, and transfer the reservation to the streaming request.
   - Release reservations/holds on every rejection, timeout, and exception.

   Repeated button/hotkey actions return busy without queueing additional captures. Existing Answer now, typed, audience, and detail requests observe the reservation. Acquisition must not block Pause or Stop.

   Stop cancels preparation that has not started generation. Answers already streaming retain existing behavior: finish and persist against their original meeting. Pause permits explicit capture requests.

   **Attach screen** acquires one main-owned draft without calling the provider or persisting it. Keep at most one composer draft per meeting, separately from an admitted request. Replace/remove, meeting end/change, renderer destruction, and application exit discard drafts. Failed replacement preserves the previous draft.

   On Send, validate draft ownership, reserve the lane, use the context current at submission, and persist the exact attached image. Retain draft/text on rejected admission; clear them only after acceptance. Reject stale tokens explicitly—never silently send a text-only question.

   A newly persisted capture is retained when its suggestion succeeds. On generation failure, remove it if no suggestion references it; detail failures must never remove their source capture. Cleanup retries interrupted failures while excluding live/preparing/streaming work.

5. **Build image-aware prompts and immutable More detail.**

   Direct capture asks for a concise explanation of the visible material in the client/team meeting’s context. For code, stack traces, errors, or failing tests, request:

   - Language/framework when identifiable and the actual visible error or symptom.
   - Likely root cause, distinguishing visible evidence from inference.
   - A minimal fix in one fenced code block, plus a short verification step.
   - A plain statement of unreadable or missing information instead of invented code, filenames, or error text.

   Non-code captures receive an explanation appropriate to the slide, diagram, or application shown. Typed-with-capture requests prioritize the typed question while applying the same evidence rules.

   Use a short headline, up to six short paragraphs/bullets, and one optional code block capped at 40 lines; allow 2,400 output tokens. Reuse the answer model, medium effort, and requested-answer timeout.

   Treat text inside screenshots as source material, never instructions. Neither screenshots nor prepared slides establish what participants said or agreed.

   Extend detail eligibility for capture answers and typed answers with captures. Load the source’s saved image alongside its original system/deck grounding, request window, and answer. Never recapture or substitute current context. Missing/corrupt images produce a clear inability-to-expand message. Reuse an existing saved detail without another provider call.

   Set `maxRetries: 0` for image-bearing requests. A new explicit More detail action authorizes another call containing the original image; no background calls receive it.

6. **Wire controls, previews, and history.**

   Add **Capture screen** to the overlay and a configurable default **Ctrl+Shift+S** shortcut. Ctrl+Shift+K continues to open the composer, whose **Attach screen**, **Replace**, and **Remove** controls show the attached thumbnail.

   Show “Capturing…” immediately, then “Screen captured — analyzing…” or a readable failure. Composer attachment feedback says it will be sent with the question. Display the captured screen identity so the owner can recognize a wrong-monitor selection.

   The capture shortcut reveals the overlay passively and preserves external focus. Only explicit composer activation takes typing focus. Store pending capture status until renderer readiness so a first-use hotkey cannot lose its feedback.

   IPC accepts meeting IDs and main-issued tokens/IDs, never arbitrary paths, renderer-supplied provider images, or unchecked desktop source IDs. Preview retrieval checks ownership and returns bounded local display data. Add `img-src 'self' data:` to the overlay CSP without allowing remote images.

   Propagate `captureId` explicitly through runner events, persistence queries, and `whisper-history`. Render image-bearing answers through existing `DetailedSuggestion`; the compact renderer would otherwise discard diagnostic prose. Keep all model text React-rendered.

   Show a thumbnail beside the answer in overlay/history, with on-demand expansion of the normalized image. Missing files show “Capture unavailable” while preserving the answer. Source and detail cards share the same capture.

   After successful persistence, notify the meeting view and refresh its suggestions as well as its existing meeting data. This covers answers that finish after Stop while history is already open.

7. **Complete privacy and cleanup integration.**

   Captures follow **whole-meeting retention**, whose current default is keep forever. Audio’s 90-day default does not delete screenshots.

   Extend `removeMeeting` to remove capture files before deleting rows. Locked-file failures retain database references for retry; missing files count as already removed. Update deletion outcomes and both consumers in IPC and retention.

   Add capture orphan cleanup under the capture store, called by retention. Restrict it to main-generated paths beneath the capture root; exclude active holds/writes. Extend retention preview/results and Settings copy with capture counts/bytes rather than calling them recordings.

   Refuse merging meetings containing captures before any mutation. This deliberately defers file ownership and timestamp remapping. Existing ordinary merges continue unchanged.

   Markdown export includes an attachment-presence notice, without image embedding or private absolute paths. Screenshots remain outside transcript FTS, summaries, email, and unrelated assistant requests.

## 4. Tests

- **Capture/encoding:** colocated `desktop.test.ts`, `encode.test.ts`, and `store.test.ts` cover display-ID matching, absent/disconnected overlay displays, mixed DPI/portrait geometry, actual thumbnail dimensions, aspect ratio, no upscaling, byte ceilings, encoding fallback, timeout/late results, bounded previews, and path confinement.
- **Preparation/admission:** new `capture-requests.test.ts`; extend `manual-requests.test.ts`, `live-session.test.ts`, and `suggestion-runner.test.ts`. Cover paused/empty-transcript requests, busy/unavailable without acquisition, repeat suppression, competing manual actions, reservation release, Stop/new-meeting races, immutable snapshots, failure cleanup, and answers finishing after Stop.
- **Prompts/provider:** new `capture-prompts.test.ts`; extend `claude.test.ts`. Assert code-aware instructions, typed-question precedence, illegibility handling, screenshot instruction boundaries, image/text content ordering, exact MIME/base64 mapping, unchanged text-only/cache behavior, and zero automatic retries.
- **Grounding:** test capture/detail eligibility, original image replay after context edits, existing-detail reuse, missing/corrupt images, and rejection of cross-meeting capture references.
- **Renderer/IPC:** extend composer, whisper-history, label, settings, hotkey, overlay-window, and live-control validation tests. Add capture-validation, draft-hook, thumbnail, and `SuggestionContent` tests covering attachment retention/clearing, stale replies, metadata preservation, complete code/prose rendering, and local image CSP.
- **Cleanup:** new `remove.test.ts` and retention `index.test.ts` cover locked/missing files, retry after partial deletion, active holds, audio-only retention preserving images, whole-meeting deletion, and orphan safety. Extend `merge-plan.test.ts`; add an export attachment-notice test.
- **Native database checks:** disposable Electron-ABI checks must exercise fresh v8 creation and a populated v7 upgrade containing source/detail links. Verify preserved IDs/sequence, capture CHECK/FK behavior, rollback, shared capture references, deletion cascades, and `foreign_key_check`. Mocked Vitest database tests do not establish these guarantees.

## 5. Verification

No builds or tests were run during planning. The implementer must run the documented gates:

1. `npm run typecheck`
2. `npm run lint`
3. `npm test`
4. `npm run format:check`
5. `npm run build`
6. `npm run dist`
7. `node scripts/release/package-check.mjs`
8. `pwsh -NoProfile -File scripts/release/smoke.ps1`

The packaged smoke must include the new disposable capture database checks and expect schema v8.

Manually verify the **packaged Windows app during a real Teams share**:

- Capture a readable code error/failing test and a non-code slide; confirm useful diagnosis/fix versus appropriate explanation.
- Submit “what’s wrong here?” with an attachment; test remove, replace, rejected admission, and provider failure.
- Exercise two monitors, mixed 100%/150%/200% scaling, portrait orientation, negative coordinates, hidden/ghosted overlay, and monitor removal.
- Confirm the screenshot captures the intended content behind the protected overlay and does not interrupt loopback audio or steal Teams focus.
- Confirm thumbnail/history persistence after restart, original-image More detail, late completion after Stop, and retention/deletion behavior.
- Exercise empty/unavailable capture, protected content, locked desktop, and remote-session behavior. Windows’ screen-access status reports granted and is not proof that acquisition will succeed; surface actual failures. [Electron permission behavior](https://www.electronjs.org/docs/latest/api/system-preferences)
- Confirm older Windows/capture-path black regions produce understandable guidance. Never disable content protection as a workaround. [Electron content protection](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows)

## 6. Docs

- **`docs/DECISIONS.md`:** explicit still capture, default display selection, encoding limits, local normalized-image persistence, whole-meeting retention, provider transmission/retry policy, original-image detail replay, and deferred window selection/merge.
- **`docs/FEATURES.md`:** Capture screen shortcut/button, composer attachments, diagnosis behavior, saved image review, and live/paused More detail.
- **`docs/GOTCHAS.md`:** DPI/display matching, unreadable dense screens, Windows blank/protected captures, attachment admission, cleanup behavior, and schema v8 acceptance requirements.
- **`STRUCTURE.md`:** add screen-capture service and global hotkey contract homes; describe capture-request coordination and keep audio capture’s existing responsibility explicit.
- **`docs/ARCHITECTURE.md`:** image data flow, provider input, schema v8, original-image grounding, file retention, and renderer preview boundary.
- **`README.md`:** packaged capture acceptance and native migration checks using existing verification commands.

## 7. Open questions / assumptions

- **Scope:** no window picker in this iteration. Move the overlay to the desired display. Cut continuous capture, OCR, region selection, multiple attachments, clipboard/file imports, image exports, and historical follow-up generation.
- **More detail:** remains available during live/paused meetings. Ended-meeting history reviews saved source/detail answers and their images, matching current product behavior.
- **Privacy interpretation:** acquisition, authoritative bytes, filesystem access, and outbound traffic remain in main. Renderers receive bounded local previews necessary for review. No separate cloud file store is introduced; provider handling remains subject to its API policy.
- **Quality tradeoff:** conservative image limits may make dense 4K text unreadable. The first remedy is enlarging the relevant application content and recapturing.
- **Storage tradeoff:** normalized images persist with successful answers; original-resolution images and unsent drafts do not. Captures remain indefinitely when whole-meeting retention is disabled.
- **Dispatch:** this is the already-dispatched planner response for orchestrator capture. Job metadata identifies account `dirtyredz60` and records effort `high`, differing from the preamble’s `medium`. No nested dispatch or repository writes were performed.
- **Work tracking:** before implementation writes, run `docket guide`, locate the work with filtered `dk list --json`/`dk show --json`, and claim it in the current worktree. Release it when finished and run `dk check` before pushing. Open notes are discussion, not approval.

## 8. Owner scope cut (2026-10-31) — overrides the sections above where they conflict

Owner chose the **trimmed** build.

**Keep:** contracts + provider-neutral image input on `AssistRequest` with the Anthropic mapping in `claude.ts` only (step 1, `maxRetries: 0` for image requests); `services/screen-capture/desktop.ts` + `encode.ts` with the display matching, DPI handling, size/byte limits and 5 s deadline (step 2); the code-aware capture prompt (step 5 prompt rules, minus detail replay); **Capture screen** button + configurable **Ctrl+Shift+S** shortcut with passive overlay reveal and "Capturing… / analyzing…" feedback; **Attach screen / Replace / Remove** in the Ctrl+Shift+K composer with a thumbnail of the in-memory draft (`useCaptureDraft.ts`); validated IPC with main-issued draft tokens only; overlay CSP `img-src 'self' data:`; shortcut-contract move to `src/shared/hotkeys/types.ts`; image-bearing answers render through `DetailedSuggestion`; browser-preview mock; docs (DECISIONS: still capture, display choice, limits, **not persisted**, one provider call).

**Cut:**

- All persistence: no `store.ts`, no capture files on disk, no schema v8, no `suggestions` rebuild, no `capture_id`, no capture repos, no diagnostics/smoke changes, no retention/remove/merge/export changes. Captured bytes live in main memory only for the duration of the request (or the composer draft) and are discarded after; the answer text persists like any typed/manual answer. The capture answer may be saved under the existing `typed` kind or another kind the current CHECK constraint already allows — **no migration**.
- More detail with original-image replay: More detail on a capture answer works from the saved answer text and context only (state this in the prompt/UI copy if needed).
- Lane reservation machinery: if a requested answer is already in flight, capture/attach-send is refused as busy before acquisition; a second capture while one is preparing is refused. Stop during preparation simply discards the result. Use the existing in-flight checks; add only a simple "capture preparing" flag if needed.
- Thumbnails in meeting history and post-restart review.

Draft lifecycle stays: one draft per meeting, discarded on meeting end/change, renderer destruction and app exit; stale tokens rejected explicitly.
