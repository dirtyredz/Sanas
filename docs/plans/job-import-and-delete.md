> **Superseded 2026-11-06 (deletion policy).** Also superseded by job-import-and-delete-v2.md. The owner chose cascade deletion; the "refuse while meetings exist" policy in this plan is not the design. See [docs/DECISIONS.md](../DECISIONS.md) ("Deleting a job deletes its history (cascade)"). Kept as written for history.

## 1. Goal

Add confirmed deletion of jobs without accidentally deleting meeting history, and a local “New job from application” workflow that creates or refreshes jobs from resumes interview packs. Refresh must preserve Sanas edits through explicit conflict resolution and keep verified notes separate from resume claims.

This is a **large change**, split into five independently verifiable slices below.

## 2. Placement

Paths are relative to the repository root. New code stays below responsibility-named directories; keep code files below approximately 800 lines and directories within the structural fan-out caps.

| File                                                                                                                      | Responsibility and reason                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/main/db/repos/job/job-deletion.ts` — new                                                                             | Dependency counts, deletion fingerprint and transactional guarded deletion. All deletion SQL belongs in a repository.    |
| `src/main/db/repos/job/application-import-schema.ts` — new                                                                | Append-only **v13** schema for application links and import baselines.                                                   |
| `src/main/db/repos/job/application-import.ts` — new                                                                       | Link lookup, current import state and atomic create/refresh transactions.                                                |
| `src/main/db/migrations.ts`                                                                                               | Register v13 without modifying versions 1–12.                                                                            |
| `src/main/db/backup.ts`                                                                                                   | Extract reusable consistent SQLite backup functionality; retain `backupBeforeMigration` as the existing startup wrapper. |
| `src/main/services/jobs/delete-job.ts` — new                                                                              | Preview, pre-delete backup and final freshness checks. No SQL.                                                           |
| `src/main/services/jobs/application-import/validate.ts` — new                                                             | Pure, bounded pack parsing and normalization.                                                                            |
| `src/main/services/jobs/application-import/catalog.ts` — new                                                              | Main-only directory enumeration and bounded file reads.                                                                  |
| `src/main/services/jobs/application-import/mapping.ts` — new                                                              | Job projection, glossary normalization and effective content digest.                                                     |
| `src/main/services/jobs/application-import/refresh-plan.ts` — new                                                         | Pure three-way comparison and resolution rules.                                                                          |
| `src/main/services/jobs/application-import/service.ts` — new                                                              | Catalog, preview and commit orchestration; short-lived preview tokens.                                                   |
| `src/main/ipc/jobs/jobs.ts` — new                                                                                         | Extract existing Jobs handlers from `ipc/index.ts`; add deletion handlers.                                               |
| `src/main/ipc/jobs/glossary.ts` — new                                                                                     | Extract existing Glossary handlers from `ipc/index.ts`, without changing their API.                                      |
| `src/main/ipc/jobs/application-import.ts` — new                                                                           | Thin validated import and root-selection handlers, including the native folder picker.                                   |
| `src/main/ipc/jobs/validate.ts` — new                                                                                     | Runtime validators for preview tokens, application selection and conflict choices.                                       |
| `src/main/ipc/index.ts`                                                                                                   | Register extracted handlers rather than accumulate more business logic.                                                  |
| `src/main/ipc/validate.ts`                                                                                                | Align ordinary job persona validation with the pack’s 20,000-character limit.                                            |
| `src/shared/jobs/deletion.ts` — new                                                                                       | Renderer-safe deletion preview/result contracts.                                                                         |
| `src/shared/jobs/application-import.ts` — new                                                                             | Catalog, preview, conflict and commit contracts; no filesystem paths.                                                    |
| `src/shared/jobs/limits.ts` — new                                                                                         | Shared job text/name limits, preventing import and manual editing from diverging.                                        |
| `src/shared/ipc.ts`                                                                                                       | Register channel strings listed below.                                                                                   |
| `src/shared/types.ts`                                                                                                     | Add the main-owned root setting; explicitly exclude it from `SettingsView`.                                              |
| `src/main/config/settings.ts`                                                                                             | Default/persist `resumesRoot`; exclude it from `toView`.                                                                 |
| `src/main/config/settings-schema.ts`                                                                                      | Add its exhaustive checker; generic renderer Settings updates must not accept this key.                                  |
| `src/preload/index.ts`                                                                                                    | Expose typed job deletion, application import and root-selection methods. Keep the existing inferred API typing.         |
| `src/renderer/src/app/jobs/deletion/DeleteJobDialog.tsx` — new                                                            | Dependency counts, blocked state and explicit confirmation.                                                              |
| `src/renderer/src/app/jobs/application-import/ApplicationPackPicker.tsx` — new                                            | Catalog and pack-selection states.                                                                                       |
| `src/renderer/src/app/jobs/application-import/ApplicationRefreshDialog.tsx` — new                                         | Before/after preview and conflict choices.                                                                               |
| `src/renderer/src/app/jobs/application-import/useApplicationImport.ts` — new                                              | Async workflow state, stale-response protection and commit handling.                                                     |
| `src/renderer/src/app/pages/JobsPage.tsx`                                                                                 | “New job from application,” archived-job visibility and post-operation reload.                                           |
| `src/renderer/src/app/pages/JobDetail.tsx`                                                                                | Delete/refresh entry points and draft coordination.                                                                      |
| `src/renderer/src/app/jobs/JobResume.tsx`, `JobOverview.tsx`                                                              | Report dirty resume state where needed; reload resume/glossary after a committed refresh.                                |
| `src/renderer/src/app/settings/sections/ApplicationPacksSection.tsx` — new                                                | Root configuration status and main-owned folder selection.                                                               |
| `src/renderer/src/app/settings/sections/SettingsSectionPage.tsx`, `frame/settings-sections.ts`, `frame/settings-draft.ts` | Register the independently saved section and its page ownership. Root selection does not enter the generic draft patch.  |
| `src/renderer/src/app/styles/pages.css`, `settings.css`                                                                   | Scoped library styles in the established stylesheet layers.                                                              |
| `src/renderer/src/dev/mock-api.ts`                                                                                        | Typed preview implementations for the new bridge methods.                                                                |

Leave `db/repos/jobs.ts`’s existing CRUD API intact. Its mixed job/glossary responsibility is existing debt; the deliberate tradeoff is to avoid an unrelated caller migration while placing all new persistence work in `db/repos/job/`. Likewise, retain the established resume validator and repository homes.

New IPC channels:

| Channel                    | Purpose                                                      |
| -------------------------- | ------------------------------------------------------------ |
| `jobs:delete-preview`      | Obtain authoritative counts and a confirmation token.        |
| `jobs:delete`              | Commit a previously previewed deletion.                      |
| `applications:root-status` | Return configured/default/unavailable status without a path. |
| `applications:select-root` | Open the main-owned directory picker and persist selection.  |
| `applications:list`        | Enumerate sanitized pack metadata and import status.         |
| `applications:preview`     | Prepare creation, refresh or archive preview.                |
| `applications:apply`       | Apply a token-bound preview and explicit resolutions.        |

Use the existing archive channel for ordinary archival. Extend Jobs listing with an optional validated `includeArchived` argument; existing no-argument callers retain their behavior.

## 3. Sequence

### Slice 1 — Contracts, extraction and persistence

1. Extract existing Jobs and Glossary IPC registrations into their specified files. Preserve behavior and existing channel strings.
2. Add typed contracts, runtime validators and bridge stubs together so the application remains type-correct.
3. Append migration **v13** with `job_application_imports`:
   - `job_id`: primary key, foreign key to jobs with `ON DELETE CASCADE`.
   - `application_id`: unique, nonempty source identity.
   - Nullable last imported producer `content_hash`.
   - Main-computed effective digest.
   - Normalized source baseline JSON.
   - Source stage, optional source timestamp and import timestamp.
4. The baseline contains only mapped job fields, normalized glossary and resume name/text. Retain company, role and `jdUrl` as source metadata; never persist `pdfPath`.
5. Creating a job, its glossary, optional resume and link is one repository transaction. Refreshing content and advancing its baseline is likewise atomic.

Existing migrations are frozen. The normal pre-upgrade backup remains mandatory and failure aborts migration.

### Slice 2 — Confirmed deletion

Present these options for the owner’s decision:

| Policy                      | Consequence                                                                                                                               | Recommendation                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Refuse while meetings exist | Any ordinary or practice meeting blocks deletion. History and recordings remain intact.                                                   | **Recommended baseline**, consistent with the exclusion of meeting-history edits. |
| Move meetings to Unsorted   | Keeps recordings and most history, but current filing clears saved resume/profile snapshots. A preserving move needs different semantics. | Requires an explicit scope decision.                                              |
| Cascade-delete meetings     | Removes transcripts, summaries, suggestions, practice results and other meeting history; recordings require separate filesystem cleanup.  | Requires a larger destructive workflow.                                           |

Implement the **refusal policy** unless the owner selects another option.

Deletion behavior:

- Protect **job id 1 unconditionally** and protect existing jobs named `Unsorted`. Do not silently rename, renumber or repurpose legacy records.
- Count meetings directly across both ordinary and practice rows. `listMeetings(jobId)` excludes practice and is unsuitable for this guard.
- A blocked preview reports ordinary and practice counts and offers archival.
- An eligible preview states exactly what will be removed:
  - One job and its context fields.
  - Number of glossary entries.
  - Saved resume: zero or one.
  - Application link: zero or one.
  - Legacy job-slide count, despite retired slide authoring.
  - Zero meetings, transcripts, summaries, practice sessions and audio files.
- Explicit confirmation names the job and requires a deliberate Delete action. Cancellation makes no changes.
- After confirmation, make a consistent database backup. Failure aborts deletion.
- After the awaited backup, synchronously re-read the job and dependencies, compare the preview fingerprint, and delete inside a repository transaction. Changes since preview require a fresh confirmation.
- Include content as well as counts in the fingerprint: an edited resume or changed glossary with the same row count must invalidate the preview.
- Repeat requests return a clear already-deleted/stale result.

The recommended policy performs **no audio deletion**. Meeting transcripts, summaries, snapshots, recordings and practice results survive because jobs containing them cannot be deleted.

If cascade deletion is selected, revise this slice before implementation: use the canonical `services/meetings/remove.ts` path, respect live/post-processing guards, report partial progress and locked recordings, and retain the job until every meeting is removed. Never rely on the job’s SQL cascade to remove WAV files. A database backup does not restore deleted recordings.

### Slice 3 — Root configuration, validation and catalog

Persist `resumesRoot` with default `C:\Users\dirty\projects\resumes`. Only main reads the root and accesses `<root>/job-hunt/sanas/`.

- Select directories through a native main-process picker.
- Exclude the root from Settings views, broadcasts and generic renderer patches.
- Sanas never creates directories, writes packs or acquires the resumes project’s write lock.
- Enumerate immediate `.json` files only. Do not interpret renderer input as a path.
- Reject symlink/reparse escapes outside the selected catalog. Bound reads before parsing; use a proposed 2 MiB per-pack ceiling and bounded enumeration batches.
- Treat each invalid file independently so one corrupt pack does not hide valid applications.
- Return readable errors without absolute paths or raw pack contents.

Validation:

- Accept schema version **1**, pending confirmation of the producer’s version number; reject unknown versions.
- Require nonempty `applicationId` and company, plus stage and integer schema version.
- Accept only `interview`, `offer` and `closed`.
- Optional fields may be absent or empty; reject incorrect supplied types, including unexpected objects or arrays.
- Enforce 20,000 characters per ordinary text field, 40,000 for resume text and 255 for resume name. Enforce limits before normalization; never silently slice source content.
- Normalize line endings. Permit normal multiline whitespace; reject NUL, forbidden control characters and deceptive directional controls.
- Drop unknown properties from the normalized projection.
- Bound glossary input separately: proposed maximum 1,000 strings, each subject to the ordinary text cap before keyterm filtering.
- Treat application IDs as opaque identifiers, never path components.
- Validate nonempty timestamps; absent timestamps display “Unknown.”
- Never read, open or copy `resume.pdfPath`. Text is authoritative for this integration.
- Validate `jdUrl` as HTTP(S) metadata; do not fetch it.

Catalog states must distinguish loading, empty directory, unavailable root, invalid pack, new application, already imported, refresh available, and closed application eligible for archival. Duplicate application IDs within the catalog are invalid/ambiguous and cannot be imported.

List on picker open and explicit Reload. No watcher is needed.

### Slice 4 — Create a job from a pack

Map fields directly:

- Name defaults to `company — role`, or company alone.
- Preserve the existing 120-character name limit. If the proposed title exceeds it, require an edited title in preview; preserve full company/role metadata.
- Copy `companyInfo`, `projectScope`, `notes`, `talkingPoints` and `persona` independently.
- Keep `summaryEmail` empty.
- Keep `jdUrl` in source metadata; do not append it automatically to verified notes.
- Missing/empty resume text creates no resume row. Nonempty text uses the existing resume validator; supply a safe display-name fallback when absent.
- Normalize glossary whitespace and deduplicate case-insensitively, preserving first occurrence order. Pass the result through `fitKeyterms` and show omitted terms/counts in preview.
- Imported glossary notes start empty.
- Never synthesize candidate facts or merge resume claims into Notes.

Raise ordinary persona editing validation from 2,000 to 20,000 characters so imported jobs remain editable.

Prevent duplicate creation with the unique application link inside the transaction. A duplicate request navigates to the existing linked job, including archived jobs.

Deleting an eligible linked job deletes its link. A later import may deliberately create a new job; no tombstone or automatic re-creation is needed.

### Slice 5 — Refresh and archive

Recommend **three-way comparison**, using previous source baseline, current Sanas value and incoming source value.

For each job field:

- Source unchanged: retain current Sanas value.
- Sanas unchanged from baseline: propose the incoming value.
- Sanas already equals incoming: no conflict.
- Both changed differently: require explicit **Keep Sanas** or **Use application**.

Treat resume name/text as one group and the complete glossary—including local glossary notes—as another group initially. This avoids accidental deletion of local additions. The tradeoff is coarser conflicts than term-level merging.

Every refresh shows a preview, including proposed clears from absent/empty fields. Keeping local content advances the source baseline to the reviewed incoming value, while the retained difference remains a local edit.

Hash handling:

- Persist the producer’s hash when present.
- Also compute a canonical digest of normalized relevant content, including stage and retained source metadata.
- Detect changes even when the producer hash is absent or incorrectly unchanged.
- A producer-hash-only change can yield a metadata-only preview.
- Do not compare or order opaque hashes. Show older source timestamps and require explicit acceptance of rollback-looking content.

Preview/application safety:

- Main issues a short-lived token bound to the selected root, pack digest, current persisted job/resume/glossary/link and proposed actions.
- Apply accepts only that token and validated choices—not replacement content or paths supplied by renderer.
- Re-read the pack before applying. After file I/O, compare current database state synchronously and commit without another await.
- A changed pack, local edit, missing job or changed root invalidates the preview.
- Disable duplicate submission; transaction uniqueness handles concurrent creation.
- Require saving or discarding unsaved JobDetail and resume drafts before opening refresh.
- After success, reload job, glossary and resume together.

For `closed`, offer an explicit **Archive linked job** action, even when content otherwise matches. Never delete automatically. Unlinked closed packs cannot create jobs. Already archived jobs remain visible through the imported marker and archived listing; later interview/offer stages never silently unarchive them.

Do not update historical or active meeting snapshots. Refresh affects job defaults used by subsequent operations under existing behavior; summaries regenerated later already use current job context.

## 4. Tests

Colocate tests with their modules and include them in ordinary Vitest coverage.

- `db/repos/job/job-deletion.test.ts`: dependency counts; practice-only refusal; id-1/Unsorted protection; glossary/resume/link/legacy-slide cascades; unrelated data preservation; changed fingerprint and rollback.
- `services/jobs/delete-job.test.ts`: backup failure; dependency or content changes during backup; repeated requests; no mutation when blocked.
- `db/repos/job/application-import.test.ts`: migration from v12; uniqueness; atomic creation and refresh; rollback on failure; archived-link lookup; baseline advancement after keeping local edits.
- Extend migration/backup tests: frozen prior migrations, v13 registration, backup failure and existing data preservation.
- `application-import/validate.test.ts`: thin packs, exact size boundaries, malformed JSON, wrong types, unknown schema, forbidden controls, missing optional values and invalid stages.
- `application-import/catalog.test.ts`: missing root, individual invalid files, duplicate identities, bounded reads, path escapes, atomic replacement and zero writes to the source tree.
- `application-import/mapping.test.ts`: notes/resume separation, absent resume, overlong title, persona compatibility, glossary deduplication and actual keyterm budgets.
- `application-import/refresh-plan.test.ts`: every three-way comparison case, clearing fields, resume/glossary group conflicts, absent/stale hashes, timestamp rollback and closed-stage behavior.
- `application-import/service.test.ts`: stale/expired token; root or file replacement; concurrent local edits; duplicate import; transactional failure; archive without content overwrite.
- `ipc/jobs/*.test.ts`: runtime argument validation, no raw path ingress, sanitized errors, root excluded from Settings views/patches, and unchanged extracted Jobs/Glossary behavior.
- Renderer tests beside the picker, refresh dialog and deletion dialog: required states, accessible confirmation, unresolved conflicts, draft protection, retry behavior and post-commit reload.
- Extend Settings and typed preview tests for the new section and methods.

Use the existing SQLite test adapter. Repository tests must not require loading the Electron-specific native database binary.

## 5. Verification

The implementer must run the repository’s documented fast gate:

- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run format:check`

Then run `npm run build`. On Windows, complete `npm run dist` and the established packaged smoke check to cover Electron/native-module integration. No paid provider calls are required.

Verify visibly using invented local packs and disposable Sanas data:

- Import a thin pack, then a populated pack.
- Refresh after independent source and Sanas edits.
- Observe invalid/unsupported packs without losing valid catalog entries.
- Archive a closed application and find its existing linked job afterward.
- Refuse deletion for a practice-only job and protect Unsorted.
- Delete an eligible job with accurate counts and a successful backup.
- Confirm no source-tree writes, no PDF access, and unchanged meeting history.

Before implementation writes, follow `docket guide`, locate/claim the appropriate item using filtered `dk` queries, and release it when finished. Run `dk check` before pushing.

No builds or tests were run during this planning review.

## 6. Docs

- `docs/DECISIONS.md`: record the owner-selected deletion policy, three-way refresh strategy, source identity assumptions and local read-only boundary.
- `docs/FEATURES.md`: explain deletion eligibility, pack selection, refresh conflicts and closed-stage archival.
- `docs/GOTCHAS.md`: document practice-inclusive deletion guards, DB-only backups, stale previews, persona limits and ignored PDF paths.
- `STRUCTURE.md`: register the new job services, repository modules, IPC homes and renderer workflow folders.
- `docs/ARCHITECTURE.md`: document application-link/baseline transactions and correct the stale claim that job filing preserves resume/profile snapshots.
- `docs/plans/job-import-and-delete.md`: intended destination for this specification.

## 7. Open questions / assumptions

- **Deletion policy remains an owner choice.** This specification proceeds with refusal while any ordinary or practice meeting exists. Moving or deleting history requires revising that slice.
- **Unsorted identity differs from the brief.** Current `ensureDefaultJob()` finds a job by name and does not reserve id 1. Protect both id 1 and existing Unsorted jobs; do not rewrite existing job identities in this feature. This may conservatively protect an ordinary legacy job at id 1.
- Assume producer `schemaVersion` is integer **1** and application IDs are stable and globally unique across root changes. Confirm these contract details before integration.
- The 2 MiB file limit and 1,000-entry raw glossary limit are proposed defensive bounds, not existing producer guarantees.
- Glossary and resume conflicts are deliberately resolved as whole groups. Finer merging is deferred.
- The session’s filesystem is read-only, so this specification **was not saved** to `docs/plans/job-import-and-delete.md`; the implementing session must save it there.
