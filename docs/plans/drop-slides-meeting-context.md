## 1. Goal

Remove presentation authoring, navigation, hotkeys and slide-based assistance completely. Let users enter meeting-only context before Start, persist it atomically with the meeting, and continue editing it through the existing Live and overlay Context editors.

Preserve existing slide records and their read-only historical markers. Mock interview behavior remains unchanged except for shared slide plumbing removal.

## 2. Placement

Paths below are relative to the repository root. Tests stay beside their owning modules.

### Start and meeting context

| Files                                                                                                            | Responsibility and change                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New:** `src/shared/meeting-start.ts`                                                                           | Renderer-facing Start options: `interview?: boolean`, `meetingContext?: string`. Replace positional presentation/interview arguments with a named options object. |
| **New:** `src/shared/meeting-context.ts`                                                                         | Shared 20,000-character context limit, used by Start validation and both editors.                                                                                 |
| **New:** `src/main/ipc/meeting-start-validation.ts`                                                              | Validate Start options without adding another responsibility to `ipc/index.ts`.                                                                                   |
| `src/main/ipc/index.ts`, `src/preload/index.ts`, `src/shared/types.ts`                                           | Carry the revised Start API consistently. Remove `usePresentationDeck`.                                                                                           |
| `src/main/services/meetings/context/start-request.ts`                                                            | Compose the shared Start options with main-only `practice`; do not expose practice or grounding snapshots through ordinary Live IPC.                              |
| `src/main/services/meetings/index.ts`                                                                            | Pass initial context into creation before assistance or STT starts; remove presentation lifecycle wiring.                                                         |
| `src/main/db/repos/meeting/meeting-create.ts`                                                                    | Atomically insert initial context as revision 0, timestamp 0. Remove deck copying and initial slide event insertion.                                              |
| `src/main/db/repos/meeting/meeting-context.ts`                                                                   | Text revisions only. Extract historical slide reads into `meeting-presentation.ts`; remove all slide/deck mutation branches.                                      |
| `src/main/services/meetings/context/session.ts`, `live-controls.ts`                                              | Text-only prepare → persist → publish, preserving revision conflicts and commit-before-publication.                                                               |
| `src/shared/live-controls/types.ts`, `src/main/ipc/live-controls-validation.ts`                                  | Reduce `MeetingContext` to meeting ID, revision and text; remove deck updates. Reject obsolete deck-write payloads.                                               |
| `src/renderer/src/app/pages/LiveMeetingPage.tsx`                                                                 | Own the pre-Start draft and render “Meeting context” adjacent to the job picker.                                                                                  |
| `src/renderer/src/lib/meeting/MeetingContextEditor.tsx`, `meeting-context-draft.ts`, `useMeetingContextDraft.ts` | Simplify the existing live editor to text-only editing, conflict handling and reload.                                                                             |
| `src/renderer/src/app/styles/pages.css`                                                                          | Fit the context field into the Live setup layout, wrapping sensibly at narrow widths.                                                                             |

`LiveMeetingPage` already stays mounted across tab switches. Keep the draft in its local state; no new storage or global state abstraction is needed.

### Presentation removal and historical retention

Delete:

- `src/renderer/src/app/jobs/PresentationEditor.tsx`
- `src/renderer/src/lib/presentation/`
- `src/renderer/src/lib/meeting/presentation-state.ts`, its test, and `usePresentationState.ts`
- `src/renderer/src/overlay-app/workspaces/SlidePanel.tsx`
- `src/main/db/repos/job/job-slides.ts`
- `src/main/services/meetings/presentation/session.ts` and its test
- `src/main/services/meetings/assist/presentation-evidence.ts` and its test
- `src/main/services/assistant/presentation/prompts.ts` and its test
- `src/main/ipc/presentation-validation.ts` and its test

Retain these narrowly defined historical components:

| Files                                                                                                        | Responsibility                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/db/repos/meeting/meeting-presentation.ts`                                                          | Read historical versions/events and detect legacy slide data. Remove `insertSlideEvent`; move `deckSlides` here. Resolve historical deck metadata directly from stored revisions. |
| `src/shared/presentation/types.ts`, `timeline.ts`                                                            | Keep historical slide/event/history contracts and timeline ordering. Remove live state and input validators.                                                                      |
| `src/main/services/meetings/presentation/history.ts`                                                         | Format recorded markers for exports and summaries.                                                                                                                                |
| `src/renderer/src/app/pages/MeetingView.tsx`, `src/main/services/meetings/export.ts`, `summary/summarize.ts` | Preserve existing read-only marker consumers.                                                                                                                                     |
| **New:** `src/main/ipc/presentation-history.ts`                                                              | Historical read handler only, replacing `ipc/presentation.ts`.                                                                                                                    |
| **New:** `src/main/ipc/hotkeys.ts`                                                                           | Extract `HotkeysStatus` registration currently hidden inside presentation IPC.                                                                                                    |

In `shared/ipc.ts` and preload, delete `PresentationJobGet`, `PresentationJobReplace`, `PresentationState`, `PresentationChanged` and `PresentationMove`. Retain `PresentationHistory` and only the historical `presentation.getHistory` API.

**Storage tradeoff:** leave all existing tables and migrations intact. Stop writes to `job_slides`, `meeting_slides` and `meeting_slide_events`. Continue inserting the empty version-0 row in `meeting_deck_versions`: both context revisions and saved answer grounding have foreign keys to it. This compatibility bookkeeping is the explicit exception to “no new writes”; removing it requires a separate migration. Do not rewrite or delete existing user records.

### Remaining UI, shortcuts and settings

- `app/pages/JobDetail.tsx`: remove the Presentation tab; preserve Resume and other tabs.
- `overlay-app/shell/OverlaySession.tsx`, workspace composition, navigation and icon mappings: remove the presentation subscription, Slide workspace and slide controls.
- `overlay-app/workspaces/OverlayContext.tsx`: remove slide-count props and slide-editing guidance.
- `lib/overlay-workspaces.ts`: remove Slide and Ctrl+4. Keep Ctrl+5 Transcript and Ctrl+6 Context unchanged.
- `lib/suggestions/useSuggestionHistory.ts`, `whisper-history.ts`: remove presentation-event handling; rename the remaining context-triggered `'slide'` action to `'context-changed'`.
- Remove orphaned slide selectors/icons from the existing overlay style and icon files.
- Update `dev/mock-api.ts`, `mock-fixtures.ts`, `mock-live-controls.ts`, `overlay-scenarios.ts`; retain only historical support from `mock-presentation.ts`.
- Remove presentation hotkey keys/actions from `shared/types.ts`, `shared/hotkeys/types.ts`, `main/config/settings.ts`, `settings-schema.ts`, `main/lifecycle/start.ts`, `services/platform/hotkeys/registration.ts`, renderer `settings/frame/settings-draft.ts` and `settings/sections/HotkeysSection.tsx`.

Keep `AudienceButton`: Ask still uses it. Preserve unrelated hotkey error reporting and capture repeat suppression.

### Assistance and merge policy

Change:

- `services/meetings/assist/meeting-prompts.ts`
- `suggestion-requests.ts`, `manual-requests.ts`
- `live-session.ts`, `live-assistance.ts`, `suggestion-runner.ts`
- `services/assistant/live-controls/prompts.ts`
- `services/assistant/answer-context/shown-ledger.ts`
- `shared/types.ts` and request/event contracts carrying presentation revisions
- `services/meetings/merge/merge.ts`, `merge-plan.ts`

These retain their current responsibilities while losing slide-specific branches. Keep `db/repos/suggestion-grounding.ts` and the existing grounding remapping in `suggestions.ts`; their stored legacy columns remain compatible.

### Rehearsal

Convert `scripts/rehearsal/scenarios/presentation.json` to `meeting-context.json`. Change `src/main/rehearsal/scenario/scenario.ts`, `run.ts`, `runner/steps.ts` and associated assertions/tests to remove slide fields, steps and expectations. Add bounded initial context to scenario Start options.

Delete `scripts/rehearsal/fixtures/slide.png` and its generation/reference paths. Use existing non-slide fixtures where capture coverage remains useful. Update `scripts/rehearsal/run.ps1` help.

No touched file needs an unrelated extraction to satisfy the approximately 800-line cap.

## 3. Sequence

1. **Record and claim the work.**  
   Run `docket guide` before item writes, inspect both items through `dk show --json`, and claim implementation in the current worktree. Use the owner’s November 4 decision as authority; open notes remain discussion, not instructions.

2. **Isolate historical compatibility.**  
   Extract historical slide reads from `meeting-context.ts`; preserve marker formatting and history IPC. Extract HotkeysStatus registration. Add legacy fixture coverage before deleting production writers.

3. **Make context persistence text-only and add initial context.**  
   Introduce shared Start options and the shared limit. Update preload, IPC validation, service request and repository creation together. Persist the submitted text as revision 0 in the meeting-creation transaction, retaining the version-0 foreign-key sentinel.  
   Update callers: Live IPC, rehearsal Start, lifecycle tests and direct repository tests. Mock continues calling `startMeeting(id, 2, { practice: true })` and receives empty initial context by default.

4. **Add the pre-Start field.**  
   Label it “Meeting context”; helper text suggests agenda, attendees, goals and talking points. Allow it with Unsorted. Preserve the draft across tabs, job changes, capture failure and failed Start. Disable editing while Start is pending; clear only after confirmed live success.  
   Existing successful-Start handling for Interview and audio capture remains intact. Live and overlay editors display and edit the saved revision-0 text.

5. **Remove active slide behavior end to end.**  
   Delete job editing/import, deck selection, Slide workspace, live slide editing, navigation IPC, preload methods and global callbacks. Remove slide writer functions and presentation lifecycle objects. Keep Ctrl+4 unbound. Remove obsolete UI copy and preview scenarios.

6. **Use conversation-based coaching and ordinary answer grounding.**  
   Freeze one job/persona/glossary/candidate system prompt at Start. Preserve job talking points. New grounding uses version 0 and empty deck context.  
   Answers, typed requests, capture and audience prompts receive conversation plus meeting context, without deck blocks or position hints. Next point always uses the ordinary coach prompt; remove current-slide restrictions and visit evidence.  
   Rename presentation-triggered coaching reset to context-triggered reset. Context Apply must still cancel stale buffered coaching, reset its policy/boundary and clear coach cards. Preserve context-revision acceptance checks; classifiers and started answers retain their captured context.  
   Preserve immutable More detail replay and stored historical grounding. Do not sanitize old records by rewriting them.

7. **Update merge eligibility conservatively.**  
   Replace `hasAppliedContext` with an explicitly named predicate covering **any nonempty initial context or any revision greater than zero**, including later clears. Reject these merges with a context-specific explanation.  
   Retain a legacy-history guard based on actual slides or slide events—not empty version rows. Ordinary meetings without context or historical slides remain mergeable. Preserve resume/profile, practice, overlap and post-processing guards.  
   This deliberately defers context timeline remapping rather than silently dropping context during cascading deletion.

8. **Retire saved hotkey settings and rehearsal slide support.**  
   Removing the hotkey defaults already makes `loadSettings` ignore saved retired keys; the next normal save omits them. Use this existing normalization rather than an eager settings rewrite. Preserve custom values for surviving shortcuts.  
   Convert the presentation scenario into a context-only plumbing check, then finish docs and Docket updates.

## 4. Tests

Add or adapt focused tests beside the affected modules:

- **Start validation and persistence:** omitted/empty/20,000-character context accepted; oversized and non-string context rejected; obsolete deck options rejected; revision 0 contains the exact submitted text. Cover selected-job and Unsorted Start.
- **Creation integrity:** meeting and initial revision commit together; failed insertion rolls back. New meetings create no slides/events and do not alter saved job decks; foreign keys remain valid with the version-0 sentinel.
- **Renderer Start flow:** tab-switch and job-change retention, failed capture/Start retention, successful clear, and saved context visible in the live editor. Preserve Interview behavior.
- **Text-only Apply:** adapt `context/session.test.ts`, context draft/state tests and IPC validation tests. Retain stale revision rejection, no-op updates, persistence-before-publication and failed-save draft retention.
- **Prompts and cancellation:** adapt `meeting-prompts.test.ts`, `suggestion-requests.test.ts`, `manual-requests.test.ts`, `live-session.test.ts`, `live-assistance.test.ts`, runner/publication and ledger tests. Assert context reaches answer and coach prompts; slide blocks/hints/revisions disappear; context edits still reject stale coaching without cancelling started answers.
- **Historical compatibility:** retain timeline/history tests; seed legacy data through repository-local test fixtures. Cover multiple deck versions, equal-time event ordering, cleared decks, history rendering, export and summary markers, and preservation of existing rows. Prepared scripts must never become transcript evidence.
- **Merge:** ordinary empty-context meetings merge; initial-context meetings, cleared-but-revised context meetings and legacy slide/event meetings refuse before mutation. Retain existing grounding remapping tests.
- **Settings/UI:** retired custom hotkeys are ignored and omitted on next save; surviving hotkeys remain unchanged; HotkeysStatus still works. No Presentation tab, Slide rail entry or Ctrl+4 action remains.
- **Rehearsal:** reject retired slide scenario inputs; verify initial context reaches real Start and outgoing answer/coach requests. Canned checks establish delivery, not model quality.

Replace `db/repos/presentation-opt-in.test.ts` with initial-context creation coverage. Delete tests solely for removed authoring, navigation and slide-specific coaching; retain historical compatibility tests.

## 5. Verification

No builds or tests were run during planning.

Implementer fast gate:

1. `npm run typecheck`
2. `npm run lint`
3. `npm exec -- vitest run` with the affected test paths from Section 4: context creation/validation, meeting lifecycle and assistance, historical presentation readers, summary/export, merge, settings/hotkeys, changed renderer components and rehearsal validation. Include existing mock-interview service regression tests.
4. `npm run build`
5. `./scripts/rehearsal/run.ps1 -Scenario mock-interview -Tier scripted -Assistant canned`

The rehearsal wrapper also builds; run only this one free rehearsal in the gate. Do not add paid providers, real microphone sessions, packaged smoke or full rehearsal tiers.

Confirm in renderer preview or an isolated fixture profile:

- Context survives leaving and returning to Live.
- Unsorted accepts context; successful Start exposes it in both editors.
- Presentation controls and settings entries are absent.
- Existing historical markers remain readable.
- Ask the audience, More detail, Screen and Interview controls still appear.

Run `dk check` before pushing. Search remaining presentation symbols and classify each retained reference as historical compatibility, schema bookkeeping or unrelated screen content.

## 6. Docs

- **`docs/DECISIONS.md`:** append the November 4 reversal, superseding active presentation behavior while retaining historical records; document initial context, conservative merge rules and the version-0 bookkeeping exception.
- **`docs/FEATURES.md`:** replace Presentation mode with legacy-history compatibility; rename Live presentation controls; document pre-Start Meeting context and remove slide controls/hotkeys/import.
- **`docs/ARCHITECTURE.md`:** document text-only context flow, atomic revision-0 persistence, one prompt base, conversation coaching and historical readers.
- **`STRUCTURE.md`:** remove deleted homes, add Start validation/history/hotkey registration responsibilities, and update enforced Layout descriptions.
- **`docs/GOTCHAS.md`:** explain foreign-key sentinel retention, initial-context merge protection, draft failure behavior, retired settings normalization and preserved context-driven coach cancellation.
- **`docs/REHEARSAL.md`:** replace presentation scenario documentation with context-only checks; remove slide steps/fields/fixtures; document the single free mock gate.

Correct nearby stale statements: FEATURES still describes schema v7 while later migrations exist; the presentation rehearsal seeds slides but calls Start without the deck opt-in, so its documented slide coverage no longer matches its execution.

For Docket, drop `dk-ba2b0a68` with the owner-decision rationale. Update and retitle `dk-36d14d59` around meeting context and manual assistance: remove slide replacement acceptance, add pre-Start context, and retain typed input, More detail and audience behavior. Do not mark remaining acceptance complete without evidence. Release claims when finished; never edit item files directly.

## 7. Open questions / assumptions

- **Storage recommendation:** no migration now; retain version-0 bookkeeping writes while retiring all presentation-content writes. A strict zero-write requirement for `meeting_deck_versions` would require separately scoped foreign-key decoupling.
- **Merge recommendation:** meetings with initial context cannot merge in this change. Preserving and remapping multiple context histories is deferred.
- **History recommendation:** keep existing timestamped markers in history, exports and regenerated summaries. Historical marker titles are the explicit exception to removing slide data from prompts.
- **Draft lifetime:** preserve across tab/job changes within the running app, not application restart. Do not introduce localStorage for meeting text.
- **Shortcut assumption:** leave Ctrl+4 unused; retain existing Transcript and Context shortcuts.
- **Docket limitation:** `dk` was unavailable in this planning environment. No item changes or claims were made; the implementer must inspect current item state through the CLI before writing.
- Unrelated schema cleanup, prompt tuning, merge remapping and mock-interview changes remain outside scope.
