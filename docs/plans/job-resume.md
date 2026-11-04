## 1. Goal

Save an optional resume on each job and snapshot it into every new Live or Mock meeting started for that job. Remove both Start-screen resume editors; preserve historical snapshots, grounding priority, transcription hints, Interview defaults and existing overlay status semantics.

Recommend moving Mock’s input too: one saved job resume should supply both practice and the actual interview.

## 2. Placement

| File                                                                      | Responsibility and change                                                                                                                           |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/db/repos/job-resume-schema.ts` **new**                          | Own v11 SQL: `job_resumes` with `job_id` as primary key and cascading foreign key, plus non-null resume name/text. No row means no resume.          |
| `src/main/db/repos/job-resume.ts` **new**                                 | Read, replace and remove a job’s resume. Keep SQL and persistence separate from meeting lifecycle and the already mixed job/glossary repository.    |
| `src/main/db/migrations.ts`                                               | Append v11 through the existing migration and backup flow.                                                                                          |
| `src/main/ipc/job-resume.ts` **new**                                      | Register validated job resume reads/writes; delegate storage to the repository.                                                                     |
| `src/main/ipc/resume-import.ts`                                           | Expose the existing parameterless picker through the job API. Preserve offline extraction and bounded reads.                                        |
| `src/shared/ipc.ts`, `src/preload/index.ts`                               | Add `jobs.getResume(jobId)`, `jobs.setResume(jobId, resumeOrNull)` and `jobs.importResume()`. Remove attachment arguments from Live and Mock Start. |
| `src/main/ipc/index.ts`                                                   | Register job-resume handlers; update ordinary Start argument validation.                                                                            |
| `src/main/ipc/mock-interview.ts`, `mock-interview-validation.ts`          | Remove attachment validation/forwarding from Mock Start.                                                                                            |
| `src/main/services/meetings/context/start-request.ts`                     | Remove `resume` from renderer-facing `StartRequest`.                                                                                                |
| `src/main/services/meetings/context/profile.ts`                           | Accept main-resolved resume presence separately when choosing the Interview profile snapshot.                                                       |
| `src/main/services/meetings/index.ts`                                     | Read the selected job’s saved resume inside serialized Start, then pass it into existing meeting creation.                                          |
| `src/main/services/mock-interview/index.ts`                               | Remove `startMock`’s attachment parameter and use ordinary Start’s job resolution.                                                                  |
| `src/renderer/src/app/jobs/JobResume.tsx` **new**                         | Own the job resume editor’s loading, draft, import and explicit save lifecycle. Adapt the existing input here.                                      |
| `src/renderer/src/lib/meeting/resume/MeetingResumeInput.tsx`              | Retire after moving its useful UI into `JobResume`; there will no longer be shared Start editors.                                                   |
| `src/renderer/src/app/pages/JobDetail.tsx`                                | Compose a Resume tab after Overview, keyed by job ID. Existing `JobTabs` already preserves mounted panels.                                          |
| `src/renderer/src/app/pages/LiveMeetingPage.tsx`, `MockInterviewPage.tsx` | Remove attachment controls/state and Start arguments. Live derives Interview’s default from the selected job.                                       |
| `src/renderer/src/app/App.tsx`                                            | Pass Live visibility so its selected-job information refreshes when returning from Jobs without unmounting capture.                                 |
| `src/renderer/src/lib/meeting/start-selection.ts`                         | Replace attachment-based Interview selection with job-based defaults and explicit override handling.                                                |
| `src/renderer/src/dev/mock-api.ts`                                        | Implement the revised bridge and job-resume persistence/snapshot behavior in browser preview.                                                       |

Preserve `MeetingCreateInput.resume`, `meeting-create.ts`’s transaction, existing meeting snapshot columns/triggers, `getMeetingGrounding`, and history’s `meetings.getResume` API.

**Deliberate tradeoff:** retain `shared/meeting-resume.ts` and the existing importer/validator under `services/meetings/context/resume/`. Their names become less precise, but moving the entire grounding/import subsystem would enlarge this focused change. Update their comments; defer broader structural cleanup. No planned change requires crossing the approximately 800-line cap.

## 3. Sequence

1. **Add job-owned persistence.**
   - Append v11; never rewrite v9/v10.
   - Store only validated display name and text, never the binary or source path.
   - `setResume(null)` removes the row; replacement updates the same job’s row.
   - Reject nonexistent jobs.
   - Leave all existing meeting resumes untouched. Do not infer a job default from historical meetings.

2. **Expose job resume IPC.**
   - Validate IDs and reuse `validateResume` for saved pasted/imported text.
   - Return the normalized saved value from `setResume`.
   - Keep import draft-only: cancellation returns null, extraction failures preserve the existing draft, and importing does not save automatically.
   - Move `meeting.importResume` to `jobs.importResume`; update the channel, handler tests and preview bridge together.
   - Keep full resume text off `jobs.list()` and all meeting/status broadcasts.

3. **Make main resolve Start grounding.**
   - Inside existing serialized Start, read the selected job’s saved resume, resolve the Interview profile, and call `createMeeting` synchronously before the next await.
   - With no selected job, resolve resume to null **before** `ensureDefaultJob()` supplies the organizational fallback.
   - Preserve `practice || (interview ?? hasSavedResume)` profile selection: explicit Live false wins; Mock always uses the saved profile.
   - Retain the meeting creation transaction and immutability guards.
   - Update the Live bridge signature to `start(jobId, channels, usePresentationDeck, interview?)`; update Mock to `start(plan, jobId, channels)`.
   - Update both IPC handlers, `startMock`, renderer callers, preview calls and affected tests atomically. An attachment must no longer influence either Start path.

4. **Install the job editor and remove Start editors.**
   - Add Resume beside Overview, Presentation, Email and Meetings.
   - Provide paste/import, name, character count, preview, replace, remove and **Save resume**.
   - Match Presentation’s independent save pattern. Explain that only saved changes affect future meetings; the header’s general Save does not save this editor.
   - Disable editing/save while importing or saving. Failed import/save retains the draft. Removal is a draft change committed by Save resume.
   - Preserve the 5 MB file limit, 40,000-character text limit and scanned-PDF paste fallback.
   - Remove Live/Mock attachment state, import handlers, validation guards and post-Start clearing. Mock may show brief guidance to edit the selected job’s Resume tab.

5. **Make Interview defaults reliable.**
   - Fetch the selected job’s resume through the focused getter on selection and when idle Live becomes visible; retain only availability for checkbox state.
   - Guard asynchronous reads against selection changes and unmount.
   - Track an explicit Interview override separately from the automatic default. Untouched Start sends `undefined`, allowing main to resolve current saved resume presence; a user’s unchecked choice sends false.
   - Selecting a different job resets the override. Refreshing the same job preserves it. A successful Start resets choices for the next meeting.
   - Unsorted defaults Interview off, but an explicit Interview choice may still select the global profile.

6. **Preserve snapshot consumers.**
   - Do not replace meeting grounding reads with job reads in prompts, summaries, streaming/reconnected/batch STT, history, More detail or merge guards.
   - Editing/removing a job resume during a live or paused meeting affects only subsequent meetings.
   - Leave practice status based on saved `hasBiography`, including fetched and broadcast state.

## 4. Tests

Add or adapt colocated tests:

- **`db/repos/job-resume.test.ts` and `job-resume-schema.test.ts`:** empty defaults, save/replace/remove, job isolation, missing-job rejection and upgrade preservation of historical resume/profile snapshots.
- **`ipc/job-resume.test.ts`:** invalid IDs/payloads, empty/oversized text, normalization and null removal. Update `resume-import.test.ts` for the new channel; retain parser limits and cancellation coverage.
- **`services/meetings/index.test.ts`:** job resume copied at Start; Unsorted receives none; later job edits/removal leave live/paused/history snapshots unchanged; subsequent meetings receive the latest value; Camunda hints survive pause/resume.
- **`context/profile.test.ts`:** saved-resume default, explicit false, profile-only selection and Mock’s unconditional profile selection.
- **Mock service/IPC tests:** replace attachment fixtures with saved job resumes; ensure both Start paths reach the same snapshot behavior.
- **`app/jobs/JobResume.test.tsx`:** save/reload, paste/import, count/preview, replacement/removal, limits, failed-save retention and cancelled/failed import retention. Adapt the retired input tests.
- **`JobDetail.test.tsx`:** five tabs, Resume placement, mounted draft preservation and keyboard navigation.
- **Live/selection tests:** remembered job, job switching, explicit override, return from Jobs, stale async results and repeated Starts.
- **`MockInterviewPage.test.tsx`:** no resume editor and no attachment argument.

Update older-schema reconstruction fixtures in `practice.test.ts`, `meeting-grounding.test.ts` and `meeting-interview-profile-schema.test.ts` to remove v11’s table before replaying migrations. Replace the grounding test’s hard-coded current version.

Retain existing grounding, prompt, merge, re-diarization and history regression tests.

## 5. Verification

No builds or tests were run during planning.

The implementer must run the **Fast verification** gate documented in `docs/REHEARSAL.md`:

- `npm run typecheck`
- `npm run lint`
- Its documented targeted Vitest command, extended with the new job-resume, job editor, Live selection and profile tests.
- `./scripts/rehearsal/run.ps1 -Scenario mock-interview -Tier scripted -Assistant canned`
- `./scripts/rehearsal/run.ps1 -Scenario coding-interview -Tier scripted -Assistant canned`
- `npm run build`

Before handoff, run the ordinary CI checks, including `npm test` and `npm run format:check`. Follow Docket’s guide/claim/release workflow during implementation and run `dk check` before pushing.

Confirm visibly in Electron:

1. Save a pasted resume; reopen the job and restart the app to verify persistence.
2. Import PDF/DOCX; verify cancellation, extraction failure, scanned-PDF guidance and limits.
3. Confirm Live and Mock have no resume input.
4. Select a resume-bearing job: Interview auto-enables, and explicit unchecking remains effective.
5. Start Live and Mock; verify history contains the saved resume.
6. Replace/remove the job resume during a meeting: existing history and grounding remain unchanged; the next meeting uses the new saved state.
7. Start Unsorted: no resume is attached.
8. Confirm practice’s “No resume or profile” cue appears only when both snapshots are empty.
9. Verify history from before the migration still displays its original resume.

Keep packaged smoke and paid provider runs outside the fast gate. Deterministic tests establish wiring and hints, not model quality.

## 6. Docs

- **`docs/DECISIONS.md`:** record the November 4 reversal and one-job-per-interview rationale; mark November 3’s ownership ruling superseded while retaining snapshot/privacy decisions.
- **`docs/FEATURES.md`:** replace “Resume for this meeting” with job Resume settings; update Mock and Interview checkbox behavior.
- **`docs/ARCHITECTURE.md`:** document v11 job storage, saved-job-to-meeting snapshot flow and revised IPC contracts.
- **`docs/GOTCHAS.md`:** replace Start-draft advice with explicit job saving, mounted-page refresh and immutable snapshot rules.
- **`STRUCTURE.md`:** replace the obsolete shared Start-input home with `JobResume`, job-resume repositories and IPC ownership.

Reconcile stale attachment-only “No resume” descriptions with the newer, implemented resume-or-profile semantics. Do not bundle unrelated documentation debt.

## 7. Open questions / assumptions

- **Unsorted:** planned as the no-job Start choice, which always snapshots no resume. The repository currently identifies its fallback job by name, without a durable special identity. Explicitly selecting a stored job named “Unsorted” remains ordinary ID-based selection under this assumption; extending the prohibition to that row needs an owner ruling.
- **Historical data:** no automatic backfill into job resumes. Existing meetings may contain different application-specific versions.
- **Mock:** use the saved job resume with no per-session override.
- **Saving:** resume changes require their own explicit Save resume action, matching the independent Presentation editor.
- **Overlay:** preserve the actual practice-only “No resume or profile” behavior; do not reintroduce attachment-only semantics.
- **Deletion:** existing job deletion behavior is outside scope. This change must not rewrite historical snapshots when a job resume is edited or removed.
