> **Superseded 2026-11-06 (deletion policy).** The owner chose cascade deletion; the "refuse while meetings exist" policy in this plan is not the design. See [docs/DECISIONS.md](../DECISIONS.md) ("Deleting a job deletes its history (cascade)"). Kept as written for history.

## 1. Goal

Add explicitly confirmed job deletion and a Jobs-area workflow that creates or refreshes linked jobs from resumes interview packs. Keep verified notes separate from resume claims, preserve local edits, and leave meeting history unchanged.

Size: **large**, split into five independently verifiable slices. Implement deletion assuming **refuse while meetings exist**, pending the owner’s choice below.

## 2. Placement

Paths below are relative to the repository root. Keep code files below approximately 800 lines and directories within the documented 12-code-file cap; use the responsibility subfolders below.

### Storage and deletion

| File                                                | Responsibility                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/main/db/repos/job/application-schema.ts` — new | Append-only v13 SQL for application links, import baselines and deletion guards. SQL belongs in repos. |
| `src/main/db/repos/job/applications.ts` — new       | Link lookup, baseline persistence and atomic create/refresh transactions.                              |
| `src/main/db/repos/job/job-deletion.ts` — new       | Complete dependency counts and atomic, guarded deletion.                                               |
| `src/main/db/repos/job/glossary.ts` — extracted     | Move glossary operations out of the mixed-responsibility `repos/jobs.ts`.                              |
| `src/main/db/repos/jobs.ts`                         | Retain job CRUD; support existing archived-job lookup and protected-job checks.                        |
| `src/main/db/migrations.ts`                         | Append v13; leave v1–v12 unchanged.                                                                    |
| `src/main/db/backup.ts`                             | Extract reusable `backupDatabase`; retain `backupBeforeMigration` as the startup-compatible wrapper.   |
| `src/main/services/jobs/deletion.ts` — new          | Preview, backup, stale-preview rejection and deletion policy.                                          |

Update glossary imports in `ipc/index.ts` during extraction, `services/meetings/context/meeting-keyterms.ts`, `services/meetings/assist/meeting-prompts.ts`, `services/meetings/summary/summarize.ts`, and their tests. These consumers retain their behavior.

### Application packs

Create `src/main/services/jobs/applications/`:

| File                    | Responsibility                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `refresh-runner.ts`     | Execute the resumes-owned CLI with bounded process lifetime and sanitized errors.    |
| `pack-files.ts`         | Enumerate and read bounded regular JSON files beneath the configured pack directory. |
| `validate-pack.ts`      | Pure schema/type/size validation and normalization.                                  |
| `map-pack.ts`           | Convert validated packs into job fields, glossary and optional resume.               |
| `merge-preview.ts`      | Pure three-way comparison and conflict classification.                               |
| `application-import.ts` | Compose listing, preview and transactional application; own expiring preview tokens. |

Do not extend the meeting orchestrator with import logic.

### IPC and contracts

| File                                                   | Responsibility                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `src/shared/jobs/applications.ts` — new                | Renderer-safe pack summaries, previews, conflict choices and operation results. |
| `src/shared/jobs/deletion.ts` — new                    | Deletion counts, protected/blocked states and confirmation results.             |
| `src/shared/jobs/limits.ts` — new                      | Shared job-name/context limits, including the imported persona limit.           |
| `src/shared/ipc.ts`                                    | Declare new channels.                                                           |
| `src/main/ipc/jobs/jobs.ts` — extracted                | Existing jobs/glossary handlers from `ipc/index.ts`.                            |
| `src/main/ipc/jobs/applications.ts` — new              | Validate application requests and delegate.                                     |
| `src/main/ipc/jobs/deletion.ts` — new                  | Validate deletion requests and delegate.                                        |
| `src/main/ipc/jobs/validate.ts` — new                  | Application IDs, opaque tokens and conflict-choice validation.                  |
| `src/main/ipc/index.ts`                                | Register the extracted handlers.                                                |
| `src/main/ipc/validate.ts`                             | Align existing job validation with shared limits.                               |
| `src/preload/index.ts`                                 | Explicit typed methods; no generic invoke or filesystem API.                    |
| `src/renderer/src/dev/mock-api.ts`, `mock-fixtures.ts` | Keep browser-preview bridge and fixtures consistent.                            |

`src/preload/index.d.ts` already derives the API type; do not duplicate it.

### Settings and UI

| File                                                                                | Responsibility                                                   |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/shared/types.ts`                                                               | Add the integration settings.                                    |
| `src/main/config/settings.ts`, `settings-schema.ts`                                 | Defaults and main-side setting validation.                       |
| `src/renderer/src/app/settings/sections/applications/ApplicationsSection.tsx` — new | Resumes root and Node executable settings.                       |
| `src/renderer/src/app/settings/sections/SettingsSectionPage.tsx`                    | Compose the new section.                                         |
| `src/renderer/src/app/settings/frame/settings-sections.ts`, `settings-draft.ts`     | Register section, editable fields, validation and saved patch.   |
| `src/renderer/src/app/jobs/applications/ApplicationPicker.tsx` — new                | Refresh/list/select workflow.                                    |
| `src/renderer/src/app/jobs/applications/ApplicationPreview.tsx` — new               | Proposed values, conflicts and archive confirmation.             |
| `src/renderer/src/app/jobs/applications/useApplicationImport.ts` — new              | Async state, stale replies and pending operations.               |
| `src/renderer/src/app/jobs/deletion/JobDeleteDialog.tsx` — new                      | Counted destructive confirmation and refusal explanations.       |
| `src/renderer/src/app/pages/JobsPage.tsx`                                           | Import entry point and archived-job visibility.                  |
| `src/renderer/src/app/pages/JobDetail.tsx`                                          | Linked-application refresh, deletion and draft coordination.     |
| `src/renderer/src/app/jobs/JobResume.tsx`                                           | Expose dirty state and explicitly reload after confirmed import. |
| `src/renderer/src/app/jobs/JobOverview.tsx`                                         | Apply shared field limits.                                       |
| `src/renderer/src/app/styles/pages.css`, `settings.css`                             | Scoped library styles; no per-component stylesheet.              |

Existing Live and Mock job selectors already reload on visibility. Preserve that behavior and test that deleted/archived selections disappear without interrupting capture.

## 3. Sequence

### Slice 1 — Contracts, extraction and v13 storage

1. Extract glossary repository operations and jobs/glossary IPC handlers without changing behavior.
2. Add settings:
   - `resumesRoot`: default `C:\Users\dirty\projects\resumes`.
   - `resumesNodeExecutable`: default `node.exe`; allow an absolute executable path.
   - Validate again at use time because persisted settings are not inherently trusted.
   - Root must be an absolute local directory; reject controls, device paths and network shares.
   - Renderer may display/edit these setting strings; only main resolves paths, reads files or starts processes.
3. Append **migration v13** containing:
   - `job_applications`: `job_id` primary key with `ON DELETE CASCADE`; unique `application_id`; canonical `source_root`; nullable last imported source `content_hash`; normalized-content fingerprint; source stage/time; import time; versioned source-baseline JSON.
   - Baseline includes imported job fields, normalized glossary and resume text/name. Never store `pdfPath`.
   - A job-deletion trigger rejecting ID 1, the current name-based Unsorted bucket, and jobs with **any** meeting rows under the recommended policy.
4. Creation/update/link/baseline writes occur in one synchronous repository transaction. A unique application constraint prevents duplicate imports, including concurrent requests.
5. Preserve existing schema-upgrade backup behavior. Update the test that currently hardcodes schema version 12.

**Existing discrepancy:** `ensureDefaultJob()` finds or creates a row named `Unsorted`; it does not guarantee ID 1. Protect both ID 1 and name-based Unsorted rows. Do not renumber existing jobs or rewrite meeting references.

### Slice 2 — Counted job deletion

> **Superseded 2026-11-06.** The owner chose cascade deletion, so the "refuse while any meeting exists" policy below is no longer the design. See [docs/DECISIONS.md](../DECISIONS.md) ("Deleting a job deletes its history (cascade)") and `src/main/services/jobs/deletion.ts`. The text below is kept as written for history.

Present these alternatives to the owner:

| Policy                      | Consequences                                                                                                                                                                       | Recommendation                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Cascade-delete meetings     | Removes normal/practice meetings, transcripts, summaries, suggestions, snapshots, practice results and recordings. Requires file-aware orchestration and partial-failure handling. | Most destructive; do not implement by deleting the job row directly. |
| Move meetings to Unsorted   | Retains meetings and recordings, but current filing clears resume/profile snapshots. Preserving those would require a separate history-policy change.                              | Conflicts with the current “no meeting-history editing” scope.       |
| Refuse while meetings exist | Deletes only empty jobs; owner can archive jobs containing history.                                                                                                                | **Recommended and assumed for implementation.**                      |

For the recommended policy:

- Preview counts directly across all dependent tables. `listMeetings(jobId)` excludes practice and is unsuitable.
- Return normal-meeting, practice-session, transcript-segment, summary, recording-reference, glossary, saved-resume, application-link and legacy `job_slides` counts.
- Block deletion for protected jobs or any meeting rows, including paused/live and practice meetings.
- For eligible jobs, confirmation states: one job, glossary count, resume count, application-link count and legacy slide count will be removed; **zero meetings and zero recordings** will be removed.
- Default action is Cancel. Confirmation remains open on failure and disables repeated submission while pending.
- Create a consistent SQLite backup before deletion. Backup failure aborts the operation.
- After the backup await, synchronously recompute the complete job/dependency fingerprint and revalidate eligibility inside the deletion transaction. Changes since preview require a fresh confirmation.
- Deleting an eligible job cascades its glossary, saved resume, application link and legacy job slides.
- No audio paths are unlinked under this policy.
- On success, return to Jobs and reload. Do not reload the application window.

If cascade is selected instead, revise this slice before implementation: enumerate all meeting types, use `services/meetings/remove.ts`, refuse live/busy children, retain the job when a child removal fails, and report any already-completed deletions. SQLite backup does **not** back up WAV files or make file deletion atomic.

### Slice 3 — Refresh runner, validated listing and creation

**Runner**

On picker open and every Refresh:

1. Read current integration settings in main.
2. Execute the configured Node executable using `execFile`, fixed arguments:
   `["_hunt/cli.js absolute path", "sanas-packs", "--json"]`.
3. Use `cwd=resumesRoot`, `shell:false`, `windowsHide:true`, a **30-second timeout**, and a **256 KiB output limit**.
4. Do not pass application IDs or pack content into the command. Strip inherited provider credentials from the child environment.
5. Coalesce concurrent refreshes for the same configuration. A settings change invalidates previous listing/preview generations.
6. After success or failure, enumerate existing packs. CLI stdout is not the source of pack contents.
7. On missing executable/script, launch denial, timeout, output overflow or nonzero exit, show **“Couldn’t refresh from resumes”** with a bounded reason and Retry. Never display raw stdout/stderr.
8. A missing pack folder is an empty state; permission/read failure is a distinct error. Neither creates directories in resumes.

Sanas directly performs only reads in the resumes tree. The invoked resumes-owned CLI performs regeneration under its own lock. No watcher, lock implementation or agent generation step belongs in Sanas.

**Untrusted pack handling**

- Accept schema version **1**; reject unknown versions per pack without hiding other valid packs.
- Require nonempty string `applicationId` and `company`, and stage `interview`, `offer` or `closed`.
- Application IDs must be bounded, safe single filename components; require filename stem and payload ID to agree. Never construct paths from unchecked renderer input.
- Optional missing/empty fields normalize to empty values. Wrong types are errors, not silently absent values.
- Enforce the contract’s 20,000-character text limits, 40,000-character resume text and 255-character resume name before normalization.
- Normalize line endings; remove NUL and disallowed control characters while preserving ordinary multiline text. Report normalization in preview.
- Use bounded reads, maximum **2 MiB per file**, and a maximum **1,000 glossary entries** before deduplication. Reject excess rather than partially parse.
- Read regular `.json` files only; reject symlink/junction escapes using canonical containment checks. Bound enumeration and return an explicit limit warning rather than silently omitting packs.
- Treat files that disappear/change during reading as retryable per-row errors.
- Ignore unknown properties through an explicit allowlisted projection; render all text as text.
- `pdfPath` is validated as optional text, then discarded. Never open, copy or delete it.
- Validate optional `updatedAt`; display missing values as Unknown.
- Treat `contentHash` as an opaque bounded string, not proof of validity. Compute a local normalized fingerprint for missing hashes and incorrectly reused hashes.

**Mapping**

- Proposed name: `company — role`, or company alone. Existing job names have a 120-character limit: show an editable, visibly shortened proposal and require explicit acceptance.
- Map `companyInfo`, `projectScope`, `notes`, `talkingPoints`, `persona` directly.
- Widen existing persona validation from 2,000 to **20,000**, matching the agreed pack contract. Other edits must still save an imported job successfully.
- Keep `summaryEmail` empty on creation and untouched on refresh.
- Normalize glossary whitespace, deduplicate case-insensitively, preserve source order, then use `fitKeyterms`. Preview excluded terms. Existing limits are 100 terms, 100 characters each and a conservative 500-byte aggregate budget.
- Empty resume text means no saved resume. Nonempty text with missing name receives a deterministic display name within 255 characters, then passes existing `validateResume`.
- Resume claims never populate Notes. Label Notes as verified grounding and the resume as separately supplied candidate material.
- Keep company, role and safe `jdUrl` as source metadata; do not append them to Notes.
- Create only from `interview`/`offer`. An unlinked `closed` pack is visible but cannot create an active job.

Creation preview and commit are separate. Commit rereads/revalidates the selected file and rejects a changed pack. Save the job, glossary, resume, link and baseline atomically.

### Slice 4 — Explicit refresh and conflict handling

Use **three-way field comparison**:

- **Base:** normalized source values from the last completed import/review.
- **Local:** current saved Sanas values.
- **Incoming:** newly validated pack.

Rules:

- Local equals base: propose incoming.
- Incoming equals base: preserve local.
- Local equals incoming: no conflict.
- Both changed differently: explicit **Keep Sanas** or **Use application** choice; default Keep Sanas.
- Never require manual merging of raw JSON.

Treat resume `{name,text}` as one unit. Treat glossary as one collection, including local term notes: local additions/deletions/annotations make source replacement a conflict. This deliberately favors simple, conservative preservation over automatic per-term merging.

Missing incoming fields mean empty source values, including resume removal. Such clearing appears in preview and obeys the same conflict rules.

On confirmed completion, atomically store the chosen values and advance the source baseline to incoming values, even where the user kept Sanas values. Thus future unchanged packs do not repeatedly challenge an intentional local override.

Additional rules:

- A changed `contentHash` marks **Refresh available**. Local fingerprint differences also trigger review when hash is absent or reused.
- Unchanged packs never overwrite local values.
- Stage transitions are reviewed independently of content hash.
- `closed` offers **Archive linked job**; it never deletes. Declining archive leaves that offer available.
- `interview`/`offer` never silently unarchives a job.
- Linked archived jobs remain marked imported and can be opened through an archived filter.
- Switching roots must not silently rebind an existing application ID from another root; show a source-mismatch error.
- Pack disappearance does not delete, unlink or archive anything.
- Job deletion removes its link. A later import is explicitly a new job.

Use expiring, main-owned preview tokens bound to sender, source configuration, pack fingerprint and current database aggregate. Commit rereads the pack and compares saved state again; stale tokens return “Changed since preview—review again.”

Before opening a refresh preview from Job Detail, require unsaved job/resume drafts to be saved or explicitly discarded. Never remount editors with dirty data silently. Refresh saved editors only after successful commit.

### Slice 5 — IPC, UI and integration

Add these channels and explicit preload methods:

| Channel                    | Purpose                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| `jobs:delete-preview`      | Return authoritative counts, eligibility and confirmation token. |
| `jobs:delete`              | Consume confirmed token and delete.                              |
| `job-applications:list`    | Run refresh, then return safe pack summaries and warnings.       |
| `job-applications:preview` | Create/import or refresh preview for a main-listed application.  |
| `job-applications:apply`   | Apply token and validated conflict/archive choices.              |

Extend existing `jobs:list` with an optional validated `includeArchived` boolean, default false. Existing callers remain compatible.

Renderer never submits a pack object, executable arguments or pack path. Scope privileged application/deletion handlers to the library window.

Picker states:

- Refreshing: progress text, duplicate Refresh disabled.
- Empty: explain eligible stages and configured source.
- Refresh failed: warning plus existing packs.
- Invalid pack: disabled row with bounded validation reason.
- Not imported: preview/create action.
- Already imported: Open job.
- Refresh available: Review changes.
- Linked closed: Archive available.
- Archived link: explicit Archived badge.
- Stale preview: retain choices where safe, require renewed review.
- Saving/error/success: disable duplicates, preserve recoverable state and reload Jobs after success.

## 4. Tests

Colocate tests with each new module; add all to the ordinary Vitest fast gate.

- `db/repos/job/application-schema.test.ts`: fresh DB and v12→v13 upgrade; unique application link; FK cascades; protected-job and meeting-existence guards.
- `db/repos/job/applications.test.ts`: atomic create/refresh, rollback after injected glossary/resume failure, duplicate requests, archived lookup, baseline advancement and source-root mismatch.
- `db/repos/job/job-deletion.test.ts`: zero-history deletion; normal and practice meetings block; ID 1 and non-ID-1 Unsorted block; glossary/resume/link/legacy-slide counts and cascades.
- `services/jobs/deletion.test.ts`: backup failure, changed preview during backup, concurrent meeting creation and unchanged recordings.
- `services/jobs/applications/validate-pack.test.ts`: thin valid packs, all field boundaries, unknown versions, malformed types, control normalization, unsafe IDs and missing optional hashes.
- `pack-files.test.ts`: bounded files, path escapes, duplicate IDs, disappearing files, inaccessible/missing folder and mixed valid/invalid results.
- `refresh-runner.test.ts`: exact executable/argv, no shell, timeout/output limits, missing CLI, nonzero exit, secret-free environment and fallback listing.
- `map-pack.test.ts`: name handling, persona limit, deduplication/keyterm budget, thin resume, missing resume name and strict Notes/resume separation.
- `merge-preview.test.ts`: every three-way branch; clearing; glossary notes; resume conflict; closed-stage archive; unchanged/missing/reused hashes.
- `application-import.test.ts`: preview expiry, wrong sender, changed settings/file/database, double apply, atomic rollback and successful idempotency.
- `ipc/jobs/*.test.ts`: malformed IDs/tokens/choices, unauthorized sender, rejected path/pack injection and safe response shapes.
- Renderer tests beside picker, preview and deletion dialog: required states, explicit confirmation, conflict defaults, retry, stale replies and unsaved-draft protection.

Update existing `job-resume.test.ts`, backup tests, IPC job-validation tests, settings-schema/draft/section tests and browser mock fixtures. Add regression coverage confirming imported refreshes do not change existing meeting resume/profile snapshots.

Repository SQL tests use `src/main/db/testing/sqlite-test-database.ts`. Mock Electron imports so the fast gate works after `npm ci --ignore-scripts`.

## 5. Verification

The implementer must run the documented fast gate:

1. `npm run typecheck`
2. `npm test`
3. `npm run lint`
4. `npm run format:check`

Then run `npm run build` and verify in Electron with a disposable absolute `--dev-user-data` directory:

- Import a thin pack and a populated pack.
- Edit Notes, glossary and resume locally; refresh changed packs and confirm preserved/conflicting values.
- Break the CLI and confirm existing packs remain available with a warning.
- Review a closed pack and explicitly archive its linked job.
- Confirm archived links prevent duplicate imports.
- Delete an eligible job with accurate counts and a pre-change backup.
- Confirm Unsorted and jobs containing normal/practice meetings cannot be deleted.
- Confirm Live/Mock selectors refresh without interrupting capture.
- Confirm historical snapshots and audio remain unchanged.
- Verify the configured Node runner works in the packaged runtime; do not assume Electron’s executable is interchangeable with Node.

Before pushing, run `dk check` and the repository’s structural gate. Follow Docket claiming/release instructions during implementation.

No build, tests, migration, CLI regeneration or application launch was performed for this plan.

## 6. Docs

- `STRUCTURE.md`: add jobs services, application/deletion IPC, job repositories and renderer subfolders; document glossary extraction.
- `docs/ARCHITECTURE.md`: document v13 linkage/baselines, CLI ownership, import transactions and refresh comparison.
- `docs/DECISIONS.md`: record the owner-selected deletion policy, conservative conflicts, source identity and snapshot preservation.
- `docs/FEATURES.md`: describe New job from application, refresh review, archive offers and deletion eligibility.
- `docs/GOTCHAS.md`: document practice-inclusive counts, Unsorted’s actual identity behavior, DB-only backups, CLI failure fallback, persona limit and missing-hash handling.

Correct stale statements where relevant: current schema is v12; Unsorted is name-resolved, not guaranteed ID 1; current filing clears candidate snapshots; `vitest.config.ts` now supports `@shared`, despite an older contradictory gotcha.

## 7. Open questions / assumptions

- **Owner decision:** cascade-delete, move to Unsorted or refuse while meetings exist. This spec proceeds with **refuse**; alternate policies require revising the deletion slice.
- **Unsorted:** protect ID 1 and existing name-based bucket rows without renumbering. Tradeoff: an ordinary legacy job at ID 1 also remains protected until identity policy is resolved.
- **Producer contract:** assume schema version 1 and `_hunt/cli.js sanas-packs --json`. Missing support produces a warning and existing-pack fallback; Sanas makes no changes to the resumes project.
- **Limits:** proposed 2 MiB file and 1,000-entry glossary bounds should be confirmed with the producer. Hash encoding is deliberately not assumed.
- **Conflict tradeoff:** whole-glossary conflicts require more explicit review but avoid silently discarding local annotations.
- **Backup tradeoff:** backups preserve deleted private data until manually managed; they provide manual recovery, not an Undo button.
- **Delivery limitation:** this sandbox is read-only. The spec above could not be saved to `docs/plans/job-import-and-delete-v2.md`; the implementing session must save it there.
